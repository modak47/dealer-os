import { StockEditor } from "../[id]/stock-editor";
import {getAdvertTemplateSettings} from "@/lib/advert-template-settings";

export const dynamic="force-dynamic";export default async function NewStockPage(){const settings=await getAdvertTemplateSettings();return <StockEditor mode="new" advertTemplates={settings.templates} placeholderImages={settings.placeholderImages.filter(image=>image.enabled).map(image=>image.image_url)}/>}
