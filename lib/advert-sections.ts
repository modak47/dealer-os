import type { AdvertTemplate } from "@/lib/advert-template-settings";
import { sectionFieldMap } from "@/lib/advert-template-settings";
import { cleanupAdvertTemplateText, renderAdvertTemplate, stripUnsafeAdvertText, type AdvertTemplateBikeData } from "@/lib/render-advert-template";

export type AdvertSectionMeta = {
  source_template_id?: string;
  section_key?: string;
  generated_from_template_at?: string;
  manually_edited_at?: string | null;
  template_version?: string;
};

export type AdvertSectionsSnapshot = Record<string, unknown> & {
  __meta?: Record<string, AdvertSectionMeta>;
};

export function createAdvertSectionsFromTemplates(templates: AdvertTemplate[], bike: AdvertTemplateBikeData, existing: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  const next: AdvertSectionsSnapshot = { ...existing };
  const meta: Record<string, AdvertSectionMeta> = isRecord(existing.__meta) ? { ...(existing.__meta as Record<string, AdvertSectionMeta>) } : {};

  for (const template of templates.filter(row => row.enabled_by_default).sort((a, b) => a.display_order - b.display_order)) {
    const field = sectionFieldMap[template.section_key];
    const existingText = typeof next[field] === "string" ? cleanupAdvertTemplateText(next[field] as string) : "";
    if (existingText) {
      next[field] = existingText;
      continue;
    }
    next[field] = renderAdvertTemplate(template.default_text, bike).text;
    meta[field] = {
      source_template_id: template.id,
      section_key: template.section_key,
      generated_from_template_at: now,
      manually_edited_at: null,
      template_version: templateVersion(template.default_text),
    };
  }

  for (const [key, value] of Object.entries(next)) {
    if (key !== "__meta" && typeof value === "string") next[key] = stripUnsafeAdvertText(value);
  }
  next.__meta = meta;
  return next;
}

export function markAdvertSectionEdited(sections: Record<string, unknown>, field: string, value: string) {
  const meta = isRecord(sections.__meta) ? { ...(sections.__meta as Record<string, AdvertSectionMeta>) } : {};
  meta[field] = { ...(meta[field] ?? {}), manually_edited_at: new Date().toISOString() };
  return { ...sections, [field]: cleanupAdvertTemplateText(value), __meta: meta };
}

export function resetAdvertSectionFromTemplate(sections: Record<string, unknown>, field: string, template: AdvertTemplate, bike: AdvertTemplateBikeData) {
  const meta = isRecord(sections.__meta) ? { ...(sections.__meta as Record<string, AdvertSectionMeta>) } : {};
  meta[field] = {
    source_template_id: template.id,
    section_key: template.section_key,
    generated_from_template_at: new Date().toISOString(),
    manually_edited_at: null,
    template_version: templateVersion(template.default_text),
  };
  return { ...sections, [field]: renderAdvertTemplate(template.default_text, bike).text, __meta: meta };
}

export function templateVersion(text: string) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  return `v${Math.abs(hash)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
