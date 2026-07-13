alter table public.dealer_advert_templates
  drop constraint if exists dealer_advert_templates_section_key_check,
  add constraint dealer_advert_templates_section_key_check
    check(section_key in ('advert_overview','vehicle_details','fitted_extras','workshop_preparation','handover','warranty','finance','delivery','why_buy'));

insert into public.dealer_advert_templates(section_key,title,default_text,display_order,enabled_by_default,editable_per_bike) values
('workshop_preparation','Preparation & Service Work Completed',E'Before delivery, this {{year}} {{make}} {{model}} will undergo a full pre-delivery inspection and safety check in our workshop.\n\n- Annual service completed before delivery where required\n- Pre-delivery inspection carried out\n- Supplied with {{mot_months}} months MOT where applicable\n- Supplied with a {{warranty_months}}-month warranty\n- Fully checked and prepared in our workshop\n- HPI checked\n- Professionally valeted',40,true,true),
('warranty','Warranty Included',E'This {{year}} {{make}} {{model}} is supplied with a {{warranty_months}}-month warranty for added peace of mind.\n\nPlease ask the YesMoto team for full warranty terms and coverage.',60,true,true),
('handover','What''s Included Before Delivery',E'Before handover, this {{make}} {{model}} will be fully prepared and checked.\n\n- Full PDI and safety inspection\n- MOT documentation where applicable\n- Service history and available documentation\n- Warranty included\n- Professional valet before collection or delivery',50,true,true),
('delivery','Nationwide Delivery Available',E'Nationwide delivery is available for this {{year}} {{make}} {{model}}.\n\nContact the YesMoto team on {{phone}} for a personalised delivery quote.',80,true,true),
('finance','Finance Options Available',E'Flexible finance options may be available on this {{year}} {{make}} {{model}}, subject to status.\n\n- Hire Purchase options available\n- Options for a range of credit profiles\n- Simple application process\n- Contact the YesMoto team for a personalised quotation',70,true,true),
('why_buy','Why Buy From YesMoto',E'- Nationwide delivery available\n- Reserve online with a {{deposit_amount}} deposit\n- All bikes inspected and prepared before handover\n- Transparent vehicle history and documentation\n- Friendly support from the YesMoto team',90,true,true)
on conflict(section_key) do update set
  title = excluded.title,
  default_text = case
    when nullif(trim(public.dealer_advert_templates.default_text),'') is null then excluded.default_text
    else public.dealer_advert_templates.default_text
  end,
  display_order = excluded.display_order,
  enabled_by_default = public.dealer_advert_templates.enabled_by_default,
  editable_per_bike = public.dealer_advert_templates.editable_per_bike;

update public.stock_bikes
set advert_sections = cleaned.cleaned
from (
  select
    id,
    jsonb_object_agg(key, case
      when jsonb_typeof(value) = 'string' then to_jsonb(
        btrim(
          regexp_replace(
            regexp_replace(value #>> '{}', '(^|\n)\s*@@\s*(\n|$)', E'\n', 'g'),
            '\{\{\s*[a-zA-Z0-9_]+\s*\}\}',
            '',
            'g'
          )
        )
      )
      else value
    end) as cleaned
  from public.stock_bikes
  cross join lateral jsonb_each(advert_sections)
  where advert_sections is not null
  group by id
) cleaned
where public.stock_bikes.id = cleaned.id
  and public.stock_bikes.advert_sections is distinct from cleaned.cleaned;
