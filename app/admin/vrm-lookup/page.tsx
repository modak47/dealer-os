import { AdminPage } from "../dashboard/page";
import { VrmLookupClient } from "./vrm-lookup-client";

export default function VrmLookupPage(){return <AdminPage title="VRM lookup" sub="Retrieve motorcycle details from a registration number."><VrmLookupClient/></AdminPage>}
