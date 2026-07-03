"use client";
import { FormEvent, useState } from "react";
import { dealership } from "@/config/dealership";

export function DemoForm({children,button="Send enquiry"}:{children:React.ReactNode;button?:string}){const [sent,setSent]=useState(false);function submit(e:FormEvent){e.preventDefault();setSent(true)}if(sent)return <div className="success"><b>Thanks — we’ve got it.</b><p>A member of the {dealership.dealerName} team will be in touch shortly.</p><button onClick={()=>setSent(false)}>Send another</button></div>;return <form className="pro-form" onSubmit={submit}>{children}<label className="check"><input type="checkbox" required/> I agree to be contacted about my enquiry.</label><button className="btn green">{button}</button></form>}
export const Field=({label,name,type="text",placeholder,required=true}:{label:string;name:string;type?:string;placeholder?:string;required?:boolean})=><label><span>{label}</span><input name={name} type={type} placeholder={placeholder} required={required}/></label>;
export const SelectField=({label,name,options}:{label:string;name:string;options:string[]})=><label><span>{label}</span><select name={name}>{options.map(o=><option key={o}>{o}</option>)}</select></label>;
