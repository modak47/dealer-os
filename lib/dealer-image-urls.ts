// Keep dealer-visible HEIC previews working without granting access to staff APIs.
export function dealerImageUrls(leadId: number, urls: string[]) {
  return urls.map(url => url.startsWith("/api/website-leads/image?") ? url.replace("/api/website-leads/image?", `/api/dealer-portal/leads/${leadId}/image?`) : url);
}
