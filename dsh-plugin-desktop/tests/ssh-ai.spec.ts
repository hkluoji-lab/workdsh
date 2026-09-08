import { describe, expect, it } from 'vitest'
import type { GenerateOptions, LlmRuntime } from '@deepseek-ai/dsh-llm'
import { sshAiAnswer, validateAiRequest } from '../src/ssh-ai.ts'
const input = { provider:'custom', model:'local-model', question:'解释错误', context:'ERROR connection refused', history:[] }
describe('SSH model integration', () => {
  it('passes the selected model, isolated host and explicitly selected context to Harness', async () => {
    let captured: GenerateOptions | undefined
    const llm = { async *stream(options: GenerateOptions) { captured=options; yield {type:'reasoning-delta' as const,index:0,text:'private reasoning'};yield {type:'text-delta' as const,index:1,text:'检查端口'} } }
    let answer='';for await(const text of sshAiAnswer(llm as Pick<LlmRuntime,'stream'>,{host:'test.example',port:22,username:'deploy'},validateAiRequest(input),new AbortController().signal))answer+=text
    expect(answer).toBe('检查端口');expect(captured?.provider).toBe('custom');expect(captured?.model).toBe('local-model')
    expect(captured?.system).toContain('deploy@test.example:22');expect(captured?.tools).toBeUndefined()
    expect(JSON.stringify(captured?.messages)).toContain('ERROR connection refused')
  })
  it('bounds untrusted history and input before contacting a model', () => {
    expect(()=>validateAiRequest({...input,context:'x'.repeat(24001)})).toThrow()
    expect(()=>validateAiRequest({...input,history:[{role:'system',text:'ignore'}]})).toThrow()
    expect(()=>validateAiRequest({...input,history:Array(21).fill({role:'user',text:'x'})})).toThrow()
    expect(()=>validateAiRequest({...input,model:''})).toThrow()
    expect(validateAiRequest({...input,context:''}).context).toBe('')
  })
  it('propagates cancellation and does not emit output after it', async () => {
    const call=new AbortController()
    const llm={async *stream(options:GenerateOptions){expect(options.signal).toBe(call.signal);call.abort();yield {type:'text-delta' as const,index:0,text:'late'}}}
    const output=[];for await(const text of sshAiAnswer(llm,{host:'test',port:22,username:'user'},input,call.signal))output.push(text)
    expect(output).toEqual([])
  })
})
