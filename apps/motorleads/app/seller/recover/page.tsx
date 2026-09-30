import type { Metadata } from 'next';
import { RecoveryForm } from './recovery-form';
export const metadata:Metadata={title:'Return to your motorcycle profile',robots:{index:false,follow:false}};
export default function Recover(){return <main className="mg-seller-page"><section className="mg-seller-empty"><h1>Return to your saved profile</h1><p>Use the email address from your submission. There is no need to submit your motorcycle again.</p><RecoveryForm/></section></main>;}
