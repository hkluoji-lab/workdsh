import { TextStyleKit } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { BlockIdentity } from "./adapter.js";
/** Reuse native schemas, commands, cell selection, column resizing and image NodeView. */
export function documentExtensions() {
  return [
    StarterKit.configure({blockquote:false,code:false,codeBlock:false,horizontalRule:false,link:false,trailingNode:false}),
    TextStyleKit.configure({lineHeight:false}),
    TextAlign.configure({types:["paragraph","heading"]}),
    TableKit.configure({table:{resizable:true,renderWrapper:true}}),
    Image.extend({
      parseHTML(){return [{tag:"img[src]",getAttrs:element=>/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(element.getAttribute("src") ?? "") ? null : false}];},
      addInputRules(){return [];},
      addAttributes(){return {...this.parent?.(),alignment:{default:"left",parseHTML:element=>element.getAttribute("data-alignment") ?? "left",renderHTML:attrs=>({"data-alignment":attrs.alignment})}};}}).configure({allowBase64:true,resize:{enabled:true,minWidth:24,minHeight:24,alwaysPreserveAspectRatio:true}}),
    BlockIdentity,
  ];
}
