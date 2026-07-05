"use client";

import { useState } from "react";

export function VehicleEnquiryForm({bike,whatsapp}:{bike:string;whatsapp:string}){
  const [sent,setSent]=useState(false);
  if(sent)return <div className="vehicle-enquiry-success"><span>✓</span><b>Thank you for your enquiry</b><p>Our team will contact you shortly to discuss the {bike}.</p><button type="button" onClick={()=>setSent(false)}>Send another enquiry</button></div>;
  return <div className="enquiry-panel"><header><span>NO PRESSURE. JUST HELPFUL ADVICE.</span><h3>Enquire about this motorcycle</h3></header><form className="vehicle-enquiry-form" onSubmit={event=>{event.preventDefault();setSent(true)}}><label><span>First name</span><input name="firstName" autoComplete="given-name" required/></label><label><span>Last name</span><input name="lastName" autoComplete="family-name" required/></label><label><span>Phone</span><input name="phone" type="tel" autoComplete="tel" required/></label><label><span>Email</span><input name="email" type="email" autoComplete="email" required/></label><label className="full"><span>Message</span><textarea name="message" rows={5} defaultValue={`I'm interested in the ${bike}. Please contact me with more information.`}/></label><label className="full consent"><input type="checkbox" required/><span>I agree that YesMoto may contact me about this enquiry.</span></label><div className="full enquiry-actions"><button type="submit">Send enquiry</button><a href={whatsapp} target="_blank" rel="noreferrer">WhatsApp instead</a></div></form></div>;
}
