import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Server, utils } from 'ssh2'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { once } from 'node:events'
import { SshService, remotePath } from '../src/ssh-service.ts'
import { sshRequestAllowed } from '../src/index.ts'
import type { IncomingMessage } from 'node:http'

let port = 0, directory = '', server: Server
const service = new SshService()
const clients = new Set<import('ssh2').Connection>()
let authentications = 0, resizeCount = 0
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(),'dsh-ssh-'))
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({type:'pkcs1',format:'pem'})
  server = new Server({hostKeys:[key]}, client => {
    clients.add(client); client.on('error',()=>{}); client.on('close',()=>clients.delete(client))
    client.on('authentication',ctx=>{authentications++;if(ctx.method==='password'&&ctx.username==='tester'&&ctx.password==='test-only')ctx.accept();else ctx.reject()})
    client.on('ready',()=>client.on('session',accept=>{
      const session=accept()
      session.on('pty',accept=>accept?.())
      session.on('window-change',accept=>{resizeCount++;accept?.()})
      session.on('shell',accept=>{const stream=accept();stream.write('ready\r\n');stream.on('data',(data:Buffer)=>stream.write(data));stream.on('error',()=>{})})
      session.on('sftp',accept=>{
        const sftp=accept(), handles=new Map<number,number>();let next=1
        const local=(p:string)=>{const file=resolve(directory,'.'+p);if(file!==directory&&!file.startsWith(directory+'/'))throw new Error('outside fixture');return file}
        const fail=(id:number)=>sftp.status(id,utils.sftp.STATUS_CODE.FAILURE)
        sftp.on('REALPATH',(id)=>sftp.name(id,[{filename:'/',longname:'/',attrs:{mode:0o40755,uid:0,gid:0,size:0,atime:0,mtime:0}}]))
        sftp.on('OPEN',(id,path,flags,attrs)=>{fs.open(local(path),utils.sftp.flagsToString(flags)!,attrs.mode,(err,fd)=>{if(err){fail(id);return}const h=next++;handles.set(h,fd);const b=Buffer.alloc(4);b.writeUInt32BE(h);sftp.handle(id,b)})})
        sftp.on('WRITE',(id,handle,offset,data)=>{const fd=handles.get(handle.readUInt32BE(0));if(fd===undefined){fail(id);return}fs.write(fd,data,0,data.length,offset,err=>err?fail(id):sftp.status(id,0))})
        sftp.on('READ',(id,handle,offset,len)=>{const fd=handles.get(handle.readUInt32BE(0));if(fd===undefined){fail(id);return}const buffer=Buffer.alloc(len);fs.read(fd,buffer,0,len,offset,(err,bytes)=>err?fail(id):bytes?sftp.data(id,buffer.subarray(0,bytes)):sftp.status(id,1))})
        sftp.on('FSTAT',(id,handle)=>{const fd=handles.get(handle.readUInt32BE(0));if(fd===undefined){fail(id);return}fs.fstat(fd,(err,stat)=>err?fail(id):sftp.attrs(id,{mode:stat.mode,uid:stat.uid,gid:stat.gid,size:stat.size,atime:Math.floor(stat.atimeMs/1000),mtime:Math.floor(stat.mtimeMs/1000)}))})
        sftp.on('STAT',(id,path)=>fs.stat(local(path),(err,stat)=>err?fail(id):sftp.attrs(id,{mode:stat.mode,uid:stat.uid,gid:stat.gid,size:stat.size,atime:Math.floor(stat.atimeMs/1000),mtime:Math.floor(stat.mtimeMs/1000)})))
        sftp.on('LSTAT',(id,path)=>fs.lstat(local(path),(err,stat)=>err?fail(id):sftp.attrs(id,{mode:stat.mode,uid:stat.uid,gid:stat.gid,size:stat.size,atime:Math.floor(stat.atimeMs/1000),mtime:Math.floor(stat.mtimeMs/1000)})))
        sftp.on('SETSTAT',(id,path,attrs)=>fs.chmod(local(path),attrs.mode,err=>err?fail(id):sftp.status(id,0)))
        sftp.on('RENAME',(id,from,to)=>fs.rename(local(from),local(to),err=>err?fail(id):sftp.status(id,0)))
        sftp.on('CLOSE',(id,handle)=>{const h=handle.readUInt32BE(0),fd=handles.get(h);if(fd===undefined){fail(id);return}handles.delete(h);fs.close(fd,err=>err?fail(id):sftp.status(id,0))})
        sftp.on('REMOVE',(id,path)=>fs.unlink(local(path),err=>err?fail(id):sftp.status(id,0)))
        sftp.on('close',()=>{for(const fd of handles.values())try{fs.closeSync(fd)}catch{};handles.clear()})
      })
    }))
  })
  server.listen(0,'127.0.0.1');await once(server,'listening');port=(server.address() as {port:number}).port
})
afterAll(async()=>{service.dispose();for(const c of clients)c.end();await new Promise<void>(r=>server.close(()=>r()));await rm(directory,{recursive:true,force:true})})
const target=()=>({host:'127.0.0.1',port,username:'tester'})
describe('real loopback SSH and SFTP',()=>{
  it('probes a fingerprint without sending authentication, rejects changed keys and bad credentials',async()=>{
    const count=authentications, key=await service.probe(target());expect(key).toMatch(/^SHA256:/);expect(authentications).toBe(count)
    await expect(service.connect({...target(),fingerprint:'SHA256:'+'A'.repeat(43),password:'test-only'})).rejects.toThrow('指纹')
    await expect(service.connect({...target(),fingerprint:key,password:'wrong'})).rejects.toThrow('连接失败')
    expect(service.sessions.size).toBe(0)
  })
  it('streams terminal data, resizes, transfers exact bytes and refuses overwrite',async()=>{
    const key=await service.probe(target()), s=await service.connect({...target(),fingerprint:key,password:'test-only'})
    let output='';service.attach(s.id,{data:b=>{output+=b.toString()},closed:()=>{}})
    service.write(s.id,'echo test\r');service.resize(s.id,120,40)
    await expect.poll(()=>output).toContain('echo test');await expect.poll(()=>resizeCount).toBeGreaterThan(0)
    const payload=Buffer.from('真实传输\n'+ 'x'.repeat(128*1024))
    await service.upload(s.id,'/upload.txt',Readable.from([payload]));expect(await readFile(join(directory,'upload.txt'))).toEqual(payload)
    await expect(service.upload(s.id,'/upload.txt',Readable.from(['overwrite']))).rejects.toThrow('上传失败');expect(await readFile(join(directory,'upload.txt'))).toEqual(payload)
    const chunks:Buffer[]=[];await service.download(s.id,'/upload.txt',new Writable({write(chunk,_encoding,done){chunks.push(Buffer.from(chunk));done()}}));expect(Buffer.concat(chunks)).toEqual(payload)
    expect(()=>service.attach(s.id,{data:()=>{},closed:()=>{}})).toThrow('已有连接')
    service.close(s.id);expect(()=>service.write(s.id,'ls')).toThrow('已关闭')
  })
  it('reads UTF-8 files, refuses changed versions and replaces files without partial writes',async()=>{
    const key=await service.probe(target()),s=await service.connect({...target(),fingerprint:key,password:'test-only'})
    service.attach(s.id,{data:()=>{},closed:()=>{}})
    await service.upload(s.id,'/config.yml',Readable.from(['port: 8080\n']))
    const document=await service.readText(s.id,'/config.yml');expect(document.text).toBe('port: 8080\n')
    // Exercise the same rename wire operation against the fixture filesystem.
    s.sftp.ext_openssh_rename=s.sftp.rename.bind(s.sftp)
    const updated=await service.saveText(s.id,'/config.yml','port: 9090\n',document.version)
    expect(updated.version).not.toBe(document.version)
    await expect(service.saveText(s.id,'/config.yml','stale',document.version)).rejects.toThrow('已被修改')
    expect((await service.readText(s.id,'/config.yml')).text).toBe('port: 9090\n')
    await service.upload(s.id,'/binary.bin',Readable.from([Buffer.from([0,255])]))
    await expect(service.readText(s.id,'/binary.bin')).rejects.toThrow('二进制')
    expect(fs.readdirSync(directory).filter(name=>name.endsWith('.tmp'))).toEqual([])
    service.close(s.id)
  })
  it('cleans a partially created upload when its source fails',async()=>{
    const key=await service.probe(target()),s=await service.connect({...target(),fingerprint:key,password:'test-only'})
    service.attach(s.id,{data:()=>{},closed:()=>{}})
    async function* input(){yield Buffer.alloc(50000);await new Promise(r=>setTimeout(r,100));throw new Error('cancelled')}
    await expect(service.upload(s.id,'/partial.txt',Readable.from(input()))).rejects.toThrow('上传失败')
    await expect(readFile(join(directory,'partial.txt'))).rejects.toThrow();service.close(s.id)
  })
})
it('rejects malformed paths and cross-origin/non-local requests',()=>{
  expect(()=>remotePath('relative')).toThrow();expect(()=>remotePath('/a\0')).toThrow();expect(remotePath('/a/../b')).toBe('/b')
  const req=(remoteAddress:string,origin?:string)=>({socket:{remoteAddress},headers:{host:'127.0.0.1:43120',origin}} as IncomingMessage)
  expect(sshRequestAllowed(req('127.0.0.1','http://127.0.0.1:43120'),43120,true)).toBe(true)
  expect(sshRequestAllowed(req('127.0.0.1','https://evil.example'),43120,true)).toBe(false)
  expect(sshRequestAllowed(req('10.0.0.1','http://127.0.0.1:43120'),43120,true)).toBe(false)
  expect(sshRequestAllowed(req('127.0.0.1'),43120,true)).toBe(false)
})
