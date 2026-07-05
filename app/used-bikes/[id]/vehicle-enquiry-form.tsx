"use client";

import { useState } from "react";

export function VehicleEnquiryForm({bike}:{bike:string}){
  const [sent,setSent]=useState(false);
  if(sent)return <div className="vehicle-enquiry-success"><b>Thank you</b><p>Your enquiry is ready for the YesMoto team. Lead delivery will be connected in the next CRM phase.</p><button type="button" onClick={()=>setSent(false)}>Send another enquiry</button></div>;
  return <form className="vehicle-enquiry-form" onSubmit={event=>{event.preventDefault();setSent(true)}}><label><span>First name</span><input name="firstName" required/></label><label><span>Last name</span><input name="lastName" required/></label><label><span>Phone</span><input name="phone" type="tel" required/></label><label><span>Email</span><input name="email" type="email" required/></label><label className="full"><span>Message</span><textarea name="message" rows={5} defaultValue={`I'm interested in the ${bike}. Please contact me with more information.`}/></label><label className="full consent"><input type="checkbox" required/><span>I agree that YesMoto may contact me about this enquiry.</span></label><button className="full" type="submit">Send motorcycle enquiry</button></form>;
}
