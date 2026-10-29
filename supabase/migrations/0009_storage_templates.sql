-- =====================================================================
-- 0009 FILE STORAGE (scanned documents) + REPORT TEMPLATES
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy attachments_files_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and app.can_read());
create policy attachments_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and app.can_write('attachments'));
-- no update / delete policies: uploaded files are permanent

-- ---------------------------------------------------------------------
-- Output templates. Editable in Admin > Templates until the official
-- Bond Commissionerate and incentive claim formats are loaded.
-- Field keys refer to columns of the data the report is built from.
-- ---------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
('template.bond_statement', $json$
{
  "title_lines": [
    "Government of the People's Republic of Bangladesh",
    "Office of the Commissioner, Customs Bond Commissionerate, Dhaka",
    "STATEMENT OF IMPORT, CONSUMPTION AND BALANCE OF BONDED RAW MATERIALS"
  ],
  "header_fields": [
    {"label": "Name of the Bonded Warehouse", "key": "company.name"},
    {"label": "Address", "key": "company.address"},
    {"label": "Bond License No.", "key": "license.license_no"},
    {"label": "License Validity", "key": "license.validity"},
    {"label": "Statement Period", "key": "period"}
  ],
  "summary_title": "Part A: Raw material balance",
  "summary_columns": [
    {"key": "sl", "label": "SL"},
    {"key": "item_name", "label": "Description of Raw Materials"},
    {"key": "unit_code", "label": "Unit"},
    {"key": "opening", "label": "Opening Balance", "number": 3},
    {"key": "imports", "label": "Imported during the period", "number": 3},
    {"key": "total", "label": "Total (Opening + Import)", "number": 3},
    {"key": "consumption", "label": "Consumed against Export (as per UD)", "number": 3},
    {"key": "closing", "label": "Closing Balance", "number": 3}
  ],
  "import_title": "Part B: Import entries (Bill of Entry wise)",
  "import_columns": [
    {"key": "sl", "label": "SL"},
    {"key": "bill_of_entry_no", "label": "B/E No."},
    {"key": "bill_of_entry_date", "label": "B/E Date", "date": true},
    {"key": "import_lc_no", "label": "BTB/Import LC No."},
    {"key": "supplier", "label": "Supplier"},
    {"key": "item_name", "label": "Raw Material"},
    {"key": "unit_code", "label": "Unit"},
    {"key": "quantity", "label": "Quantity", "number": 3}
  ],
  "export_title": "Part C: Export entries (Bill of Export wise) and consumption",
  "export_columns": [
    {"key": "sl", "label": "SL"},
    {"key": "shipping_bill_no", "label": "Bill of Export No."},
    {"key": "shipping_bill_date", "label": "Date", "date": true},
    {"key": "exp_no", "label": "EXP No."},
    {"key": "invoice_no", "label": "Invoice No."},
    {"key": "contract_no", "label": "Master LC / SC"},
    {"key": "ud_no", "label": "UD No."},
    {"key": "garment_qty_pcs", "label": "Garments (Pcs)", "number": 0},
    {"key": "item_name", "label": "Raw Material"},
    {"key": "coefficient_per_dozen", "label": "Coefficient / Dz", "number": 4},
    {"key": "consumption", "label": "Consumption", "number": 3}
  ],
  "footer_lines": [
    "We certify that the above information is true and correct as per our records, Bills of Entry, Bills of Export and Utilization Declarations."
  ],
  "signatures": ["Prepared by", "Checked by", "Authorised Signatory"]
}
$json$::jsonb, 'Customs bond statement layout (replace with Bond Commissionerate format)'),
('template.incentive_claim', $json$
{
  "title_lines": [
    "Form - Ka (ক)",
    "Application for Cash Assistance / Export Incentive against Export",
    "(As per Bangladesh Bank FE Circular)"
  ],
  "addressee": ["To", "The Manager", "{bank.name}", "{bank.branch}"],
  "rows": [
    {"label": "1. Name and address of the exporter", "key": "company.name_address"},
    {"label": "2. ERC No. / BIN", "key": "company.erc_bin"},
    {"label": "3. Export LC / Sales Contract No. and date", "key": "contract.no_date"},
    {"label": "4. Value of LC / Contract", "key": "contract.value"},
    {"label": "5. Name and address of the importer (buyer)", "key": "buyer.name_address"},
    {"label": "6. Commercial Invoice No(s).", "key": "claim.invoice_nos"},
    {"label": "7. EXP No(s).", "key": "claim.exp_nos"},
    {"label": "8. Description and quantity of goods", "key": "claim.goods"},
    {"label": "9. Shipment date (B/L date)", "key": "claim.bl_date"},
    {"label": "10. Country of destination", "key": "contract.destination_country"},
    {"label": "11. Export bill reference (FDBC/FDBP)", "key": "claim.bill_ref_no"},
    {"label": "12. Gross invoice value", "key": "claim.bill_value"},
    {"label": "13. Realized value and date", "key": "claim.realized"},
    {"label": "14. PRC No. and date", "key": "claim.prc"},
    {"label": "15. Net FOB value (base for incentive)", "key": "claim.base_amount"},
    {"label": "16. Scheme / rate of cash assistance", "key": "claim.scheme_rate"},
    {"label": "17. Amount of cash assistance claimed", "key": "claim.claim_amount"},
    {"label": "18. Amount in BDT (at realization rate)", "key": "claim.claim_amount_bdt"}
  ],
  "declaration": "We hereby declare that the information furnished above is correct, that the goods were produced in Bangladesh, and that no claim has been made earlier against this export.",
  "enclosures_title": "Enclosures",
  "signatures": ["Authorised Signatory of the Exporter"]
}
$json$::jsonb, 'Cash incentive claim layout (replace with your claim format)')
on conflict (key) do nothing;
