import type { Metadata } from 'next';
import { RecoveryForm } from './recovery-form';
import { absoluteUrl } from '../../site';
export const metadata:Metadata={title:'Return to your motorcycle profile',description:'Request a secure link to your saved MotorGeeks seller profile.',alternates:{canonical:absoluteUrl('/seller/recover')},robots:{index:false,follow:false}};
export default function Recover(){return <main className="mg-seller-page"><section className="mg-seller-empty"><h1>Return to your saved profile</h1><p>Use the email address from your submission. There is no need to submit your motorcycle again.</p><RecoveryForm/></section></main>;}
