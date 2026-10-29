-- =====================================================================
-- SAMPLE DATA for testing.
-- Real (from company documents): company, Al-Arafah lien bank, UniCredit,
--   buyers Industrial Wear S.r.l. (Payper) and Primark Limited,
--   S/C IKGPL/PAYPER/004/2024, Payper LC 411011484842, Primark S/C PMK-IKGPL-06-2026,
--   freight forwarders from the house BLs.
-- ILLUSTRATIVE (marked SAMPLE): suppliers, BTB LCs, PIs, acceptances, payments,
--   shipments, GRNs, export invoices/bills/realizations, UD, bond license,
--   facility limits, exchange rates and incentive rates. Replace before go-live.
-- Run once on an empty database (Supabase SQL editor, as postgres).
-- =====================================================================

-- ---------- currencies, rates, units, HS codes
insert into currencies (code, name, symbol) values
 ('USD','US Dollar','$'), ('EUR','Euro','€'), ('BDT','Bangladesh Taka','৳'),
 ('GBP','Pound Sterling','£'), ('CNY','Chinese Yuan','¥'), ('INR','Indian Rupee','₹');

insert into currency_rates (currency_code, rate_date, rate_to_bdt, source) values
 ('USD','2024-01-01',110.00,'SAMPLE'), ('USD','2024-05-08',117.00,'SAMPLE'),
 ('USD','2024-12-01',120.00,'SAMPLE'), ('USD','2025-07-01',122.50,'SAMPLE'),
 ('USD','2026-01-01',122.20,'SAMPLE'),
 ('EUR','2024-01-01',120.00,'SAMPLE'), ('EUR','2025-07-01',140.00,'SAMPLE'),
 ('EUR','2026-01-01',142.50,'SAMPLE'),
 ('GBP','2026-01-01',163.00,'SAMPLE'), ('CNY','2026-01-01',17.00,'SAMPLE'),
 ('INR','2026-01-01',1.42,'SAMPLE');

insert into units (code, name) values
 ('kg','Kilogram'), ('pcs','Pieces'), ('dz','Dozen'), ('yds','Yards'), ('mtr','Metre'),
 ('ltr','Litre'), ('cone','Cone'), ('ctn','Carton'), ('set','Set'), ('roll','Roll');

insert into hs_codes (code, description, unit_code) values
 ('5205.12.00','Single cotton yarn, combed, 714.29-232.56 decitex','kg'),
 ('5206.12.00','Single cotton yarn (<85% cotton), uncombed','kg'),
 ('3204.16.00','Reactive dyes','kg'),
 ('3809.91.00','Finishing agents / textile auxiliaries','kg'),
 ('5807.10.00','Woven labels','pcs'),
 ('4821.10.00','Printed paper labels / hang tags','pcs'),
 ('3923.21.00','Polybags of polymers of ethylene','pcs'),
 ('4819.10.00','Cartons of corrugated paper','pcs'),
 ('6109.10.00','T-shirts, singlets etc., knitted, of cotton','pcs');

-- ---------- banks & facilities
insert into banks (name, short_name, branch, address, country, swift_code, is_local, bank_roles, account_no) values
 ('Al-Arafah Islami Bank PLC','AIBL','Narayanganj Branch',
  'Delwar Hossain Market, 71 B.B. Road, D.I.T, Narayanganj 1400','Bangladesh','ALARBDDH088', true,
  '{lien,opening,negotiating,advising}','0381020020704'),
 ('UniCredit S.p.A.','UniCredit','Milano','Foreign Trade Center Bologna, Via del Lavoro 42, 40127 Bologna, Italy',
  'Italy','UNCRITMM', false, '{issuing}', null),
 ('Standard Chartered Bank','SCB','Client Services Group, Europe','1 Basinghall Avenue, London EC2V 5DD, UK',
  'United Kingdom', null, false, '{issuing}', null);

insert into bank_facilities (bank_id, facility_type, is_funded, limit_amount, currency, valid_from, valid_to, sanction_ref, remarks)
select b.id, f.t::facility_type, f.funded, f.lim, f.cur, '2026-01-01', '2026-12-31', 'SAMPLE', 'SAMPLE limit - replace from sanction letter'
  from banks b, (values ('BTB', false, 12000000, 'USD'), ('UPAS', true, 3000000, 'USD'),
                        ('EDF', true, 4000000, 'USD'), ('PC', true, 250000000, 'BDT'),
                        ('FDBP', true, 5000000, 'USD')) f(t, funded, lim, cur)
 where b.short_name = 'AIBL';

-- ---------- buyers, suppliers, agents, forwarders
insert into buyers (code, name, address, country, market, contact_person, email, phone, vat_no, default_payment_terms) values
 ('PAYPER','Industrial Wear S.r.l. a Socio Unico (Payper Wear)',
  'Via Benito Partisani 1, 47016 Fiumana di Predappio (FC), Italy','Italy','EU',null,'info@payperwear.it',
  '+39 0543 941510','IT03353860400','Deferred 100 days after shipment (pre-payment at sight available)'),
 ('PRIMARK','Primark Limited','Arthur Ryan House, 22-24 Parnell Street, Dublin 1, Ireland','Ireland','EU',
  null,null,'+353 1 888 0500','IE8N490030','30 days from receipt of documentation, T.T.');

insert into suppliers (code, name, origin, category, country, address, contact_person, phone) values
 ('RSM','Riverside Spinning Mills Ltd (SAMPLE)','local','yarn','Bangladesh','Gazipur, Bangladesh','Sales Manager','+880 1700 000001'),
 ('DTA','Delta Trims & Accessories Ltd (SAMPLE)','local','accessories','Bangladesh','Ashulia, Savar, Dhaka','Sales Manager','+880 1700 000002'),
 ('NED','Ningbo Everbright Dyes & Chemicals Co., Ltd (SAMPLE)','foreign','dyes & chemicals','China','Ningbo, Zhejiang, China','Export Dept','+86 574 0000 0000');

insert into cf_agents (name, license_no, ports, address, phone) values
 ('Karnaphuli C&F Services (SAMPLE)','SAMPLE-CF-001','{Chattogram,"Dhaka ICD"}','Agrabad, Chattogram','+880 1800 000001');

insert into freight_forwarders (name, license_no, address) values
 ('APM Global Logistics Bangladesh Ltd (Maersk)','101-08-3-0217','Gulshan Centre Point, 20th Floor, Road 90, Gulshan 2, Dhaka 1212'),
 ('EUR Service (BD) Ltd','101-08-3-0323','Rangs Paramount, 6th Floor, House 11, Road 17, Banani, Dhaka 1213'),
 ('MGH Logistics Pvt. Ltd.',null,'Level 10, Sayeed Khokon''s Autograph, Plot 67 & 68, Kemal Ataturk Avenue, Banani, Dhaka 1213'),
 ('Total Transportation Ltd.',null,'Sayeed Khokon''s Autograph, Level 10, Plot 67 & 68, Kemal Ataturk Avenue, Banani, Dhaka 1213'),
 ('Crown Container Line Ltd.','101-08-3-0114','Dhaka'),
 ('Sun Star Cargo Systems Ltd.','101-16-3-0847','Hashim Tower (7th Floor), 205/1-A Gulshan-Tejgaon Link Road, Dhaka 1212');

insert into items (code, name, category, unit_code, hs_code_id, is_bonded)
select v.code, v.name, v.cat, v.unit, (select id from hs_codes where code = v.hs), true
  from (values
   ('YRN-30C','Cotton combed yarn 30/1','yarn','kg','5205.12.00'),
   ('YRN-26B','BCI cotton yarn 26/1','yarn','kg','5205.12.00'),
   ('DYE-RX','Reactive dyes','dyes','kg','3204.16.00'),
   ('CHM-FA','Finishing chemicals / auxiliaries','chemicals','kg','3809.91.00'),
   ('ACC-ML','Main label (woven)','accessories','pcs','5807.10.00'),
   ('ACC-HT','Hang tag','accessories','pcs','4821.10.00'),
   ('PKG-PB','Polybag','packing','pcs','3923.21.00'),
   ('PKG-CT','Export carton (5 ply)','packing','pcs','4819.10.00')) v(code, name, cat, unit, hs);

-- ---------- export contracts
insert into export_contracts (contract_no, contract_type, buyer_id, issuing_bank_id, lien_bank_id, currency, value,
  tolerance_pct, quantity_pcs, issue_date, last_shipment_date, expiry_date, lien_date, payment_terms, tenor_days,
  tenor_basis, incoterm, port_of_loading, port_of_discharge, destination_country, btb_entitlement_pct,
  consignee_text, notify_text, remarks, status)
values
 ('IKGPL/PAYPER/004/2024','SC',(select id from buyers where code='PAYPER'), null,
  (select id from banks where short_name='AIBL'),'USD',7036710.00,5,4317000,'2024-04-11','2025-07-16','2025-08-15','2024-04-20',
  '100 days deferred with discounting clause; balance by replacement export LC',100,'bl_date','FCA',
  'Chattogram / Dhaka, Bangladesh','Any port, Italy','Italy',75,
  'TO THE ORDER OF AL-ARAFAH ISLAMI BANK LTD, NARAYANGANJ BRANCH, 71 B.B. ROAD, D.I.T, NARAYANGANJ, BANGLADESH',
  'INDUSTRIAL WEAR SRL, VIA PARTISANI 1, 47016 PREDAPPIO FC, ITALY',
  'RCVD-05 dated 30-Apr-2025. S/C shows LSD 16-Jul-2025 but shipment window 16-31 Jul 2025 - confirm.','closed'),
 ('411011484842','LC',(select id from buyers where code='PAYPER'),(select id from banks where short_name='UniCredit'),
  (select id from banks where short_name='AIBL'),'USD',2000000.00,5,null,'2026-06-29','2026-08-31','2026-09-21',null,
  'Deferred payment 100 days after shipment date; pre-payment at sight on request (SOFR + 1.40%)',100,'bl_date','FOB',
  'Any port in Bangladesh','Any port in Italy','Italy',75,
  'TO THE ORDER OF AL-ARAFAH ISLAMI BANK LTD, NARAYANGANJ BRANCH, 71 B.B. ROAD, D.I.T, NARAYANGANJ, BANGLADESH',
  'INDUSTRIAL WEAR SRL, VIA PARTISANI 1, 47016 PREDAPPIO FC, ITALY', null,'active'),
 ('PMK-IKGPL-06-2026','SC',(select id from buyers where code='PRIMARK'), null,
  (select id from banks where short_name='AIBL'),'USD',14765000.00,5,11812000,'2026-01-03','2027-01-31','2027-02-15','2026-10-04',
  '30 days from receipt of documentation; T.T. after customer approval (max 1% charges)',30,'buyer_acceptance_date',
  'FCA','Chattogram, Bangladesh','Rotterdam / Valencia / Felixstowe / Dublin / New York','Ireland',75,
  'TO THE ORDER OF AL-ARAFAH ISLAMI BANK LTD, NARAYANGANJ BRANCH, 71 B.B. ROAD, D.I.T, NARAYANGANJ, BANGLADESH',
  'PRIMARK LIMITED, ARTHUR RYAN HOUSE, 22-24 PARNELL STREET, DUBLIN 1, IRELAND',
  'RCVD-04. Lien letter dated 04-Oct-2026 says 82,12,000 pcs; contract shows 118,12,000 pcs x $1.25 = $147,65,000.','active');

-- ---------- UDs with consumption coefficients (SAMPLE numbers)
insert into uds (contract_id, ud_type, association, ud_no, ud_date, garment_qty_pcs) values
 ((select id from export_contracts where contract_no='IKGPL/PAYPER/004/2024'),'UD','BGMEA','SAMPLE-UD-2024-0418','2024-05-02',4317000),
 ((select id from export_contracts where contract_no='411011484842'),'UD','BGMEA','SAMPLE-UD-2026-0712','2026-07-03',1220000),
 ((select id from export_contracts where contract_no='PMK-IKGPL-06-2026'),'UD','BGMEA','SAMPLE-UD-2026-0915','2026-09-05',11812000);

insert into ud_items (ud_id, item_id, coefficient_per_dozen, wastage_pct)
select u.id, i.id, v.coef, v.wst
  from (values
   ('SAMPLE-UD-2024-0418','YRN-30C',2.10,12), ('SAMPLE-UD-2024-0418','ACC-ML',12,0), ('SAMPLE-UD-2024-0418','PKG-PB',12,0),
   ('SAMPLE-UD-2024-0418','PKG-CT',0.12,0),
   ('SAMPLE-UD-2026-0712','YRN-30C',2.10,12), ('SAMPLE-UD-2026-0712','DYE-RX',0.060,0), ('SAMPLE-UD-2026-0712','CHM-FA',0.090,0),
   ('SAMPLE-UD-2026-0712','ACC-ML',12,0), ('SAMPLE-UD-2026-0712','ACC-HT',12,0), ('SAMPLE-UD-2026-0712','PKG-PB',12,0),
   ('SAMPLE-UD-2026-0712','PKG-CT',0.12,0),
   ('SAMPLE-UD-2026-0915','YRN-26B',2.05,12), ('SAMPLE-UD-2026-0915','DYE-RX',0.060,0), ('SAMPLE-UD-2026-0915','CHM-FA',0.090,0),
   ('SAMPLE-UD-2026-0915','ACC-ML',12,0), ('SAMPLE-UD-2026-0915','PKG-PB',12,0), ('SAMPLE-UD-2026-0915','PKG-CT',0.12,0)
  ) v(ud, item, coef, wst)
  join uds u on u.ud_no = v.ud join items i on i.code = v.item;

-- ---------- import / BTB LCs (all SAMPLE), opened at Al-Arafah
insert into import_lcs (lc_no, application_no, application_date, contract_id, supplier_id, bank_id, payment_type,
  currency, value, tolerance_pct, opening_date, last_shipment_date, expiry_date, tenor_days, tenor_basis,
  incoterm, goods_description, status)
select v.lc, v.app, v.appd::date, (select id from export_contracts where contract_no = v.ml),
       (select id from suppliers where code = v.sup), (select id from banks where short_name='AIBL'),
       v.ptype, 'USD', v.val, 0, v.opd::date, v.lsd::date, v.exp::date, v.tenor, v.basis, v.inco, v.goods, v.st
  from (values
   ('SAMPLE-0881-24-0101','APP-24-101','2024-05-02','IKGPL/PAYPER/004/2024','RSM','deferred',1850000.00,'2024-05-05','2025-06-30','2025-07-15',120,'acceptance_date','FCA','Cotton combed yarn 30/1','opened'),
   ('SAMPLE-0881-24-0114','APP-24-114','2024-05-18','IKGPL/PAYPER/004/2024','DTA','deferred',210000.00,'2024-05-20','2025-06-30','2025-07-15',90,'acceptance_date','FCA','Labels, polybags, cartons','opened'),
   ('SAMPLE-0881-26-0307','APP-26-307','2026-07-03','411011484842','RSM','deferred',780000.00,'2026-07-05','2026-08-10','2026-08-25',120,'acceptance_date','FCA','Cotton combed yarn 30/1','opened'),
   ('SAMPLE-0881-26-0311','APP-26-311','2026-07-06','411011484842','NED','upas',240000.00,'2026-07-08','2026-08-15','2026-08-31',180,'bl_date','CFR Chattogram','Reactive dyes and finishing chemicals','opened'),
   ('SAMPLE-0881-26-0315','APP-26-315','2026-07-09','411011484842','DTA','deferred',95000.00,'2026-07-10','2026-08-10','2026-08-25',90,'acceptance_date','FCA','Labels, hang tags, polybags, cartons','opened'),
   ('SAMPLE-0881-26-0402','APP-26-402','2026-09-08','PMK-IKGPL-06-2026','RSM','deferred',3200000.00,'2026-09-10','2026-12-31','2027-01-15',120,'acceptance_date','FCA','BCI cotton yarn 26/1','opened'),
   ('SAMPLE-0881-26-0419','APP-26-419','2026-09-16','PMK-IKGPL-06-2026','NED','sight',410000.00,'2026-09-18','2027-02-10','2027-02-25',0,'acceptance_date','CFR Chattogram','Reactive dyes and finishing chemicals','opened'),
   (null,'APP-26-433','2026-10-19','PMK-IKGPL-06-2026','RSM','deferred',7600000.00,null,'2027-01-15','2027-01-31',120,'acceptance_date','FCA','Cotton combed yarn 30/1 - bulk programme','draft')
  ) v(lc, app, appd, ml, sup, ptype, val, opd, lsd, exp, tenor, basis, inco, goods, st);

-- ---------- PIs and items
insert into proforma_invoices (pi_no, pi_date, supplier_id, currency, contract_id, import_lc_id)
select v.pi, v.d::date, (select id from suppliers where code = v.sup), 'USD',
       l.contract_id, l.id
  from (values
   ('RSM/PI/24/0412','2024-04-28','RSM','APP-24-101'), ('DTA/PI/24/0188','2024-05-15','DTA','APP-24-114'),
   ('RSM/PI/26/0655','2026-06-30','RSM','APP-26-307'), ('NED-PI-260702','2026-07-02','NED','APP-26-311'),
   ('DTA/PI/26/0301','2026-07-05','DTA','APP-26-315'), ('RSM/PI/26/0811','2026-09-02','RSM','APP-26-402'),
   ('NED-PI-260910','2026-09-10','NED','APP-26-419'), ('RSM/PI/26/1007','2026-10-15','RSM','APP-26-433')
  ) v(pi, d, sup, app) join import_lcs l on l.application_no = v.app;

insert into pi_items (pi_id, item_id, quantity, unit_code, unit_price)
select p.id, i.id, v.qty, i.unit_code, v.price
  from (values
   ('RSM/PI/24/0412','YRN-30C',500000,3.70),
   ('DTA/PI/24/0188','ACC-ML',6000000,0.015), ('DTA/PI/24/0188','PKG-PB',6000000,0.010), ('DTA/PI/24/0188','PKG-CT',60000,1.00),
   ('RSM/PI/26/0655','YRN-30C',200000,3.90),
   ('NED-PI-260702','DYE-RX',30000,6.50), ('NED-PI-260702','CHM-FA',15000,3.00),
   ('DTA/PI/26/0301','ACC-ML',2000000,0.015), ('DTA/PI/26/0301','ACC-HT',1500000,0.020),
   ('DTA/PI/26/0301','PKG-PB',2500000,0.010), ('DTA/PI/26/0301','PKG-CT',10000,1.00),
   ('RSM/PI/26/0811','YRN-26B',800000,4.00),
   ('NED-PI-260910','DYE-RX',50000,6.40), ('NED-PI-260910','CHM-FA',30000,3.00),
   ('RSM/PI/26/1007','YRN-30C',1900000,4.00)
  ) v(pi, item, qty, price)
  join proforma_invoices p on p.pi_no = v.pi join items i on i.code = v.item;

-- ---------- acceptances (maturity is calculated by trigger)
insert into acceptances (import_lc_id, supplier_invoice_no, invoice_date, document_value, docs_received_date,
                         bl_awb_no, bl_date, acceptance_date, acceptance_ref)
select l.id, v.inv, v.invd::date, v.val, v.rcv::date, v.bl, v.bld::date, v.accd::date, v.ref
  from (values
   ('SAMPLE-0881-24-0101','RSM-24-7781','2024-08-15',1850000.00,'2024-08-20',null,null,'2024-08-25','ACC-24-0311'),
   ('SAMPLE-0881-24-0114','DTA-24-2290','2024-10-12',210000.00,'2024-10-16',null,null,'2024-10-20','ACC-24-0402'),
   ('SAMPLE-0881-26-0307','RSM-26-1102','2026-07-15',400000.00,'2026-07-18',null,null,'2026-07-20','ACC-26-0288'),
   ('SAMPLE-0881-26-0307','RSM-26-1240','2026-08-01',360000.00,'2026-08-03',null,null,'2026-08-05','ACC-26-0317'),
   ('SAMPLE-0881-26-0311','NED-EXP-2607-118','2026-07-27',240000.00,'2026-08-06','NGB2607280451','2026-07-28','2026-08-08','ACC-26-0322'),
   ('SAMPLE-0881-26-0315','DTA-26-0812','2026-07-22',95000.00,'2026-07-23',null,null,'2026-07-25','ACC-26-0301'),
   ('SAMPLE-0881-26-0402','RSM-26-2051','2026-10-01',900000.00,'2026-10-03',null,null,'2026-10-05','ACC-26-0415'),
   ('SAMPLE-0881-26-0419','NED-EXP-2610-031','2026-10-01',410000.00,'2026-10-12','NGB2610020118','2026-10-02','2026-10-12','SIGHT-26-0099')
  ) v(lc, inv, invd, val, rcv, bl, bld, accd, ref) join import_lcs l on l.lc_no = v.lc;

-- ---------- import shipments & port clearing
insert into import_shipments (import_lc_id, acceptance_id, mode, vessel_flight, bl_awb_no, bl_awb_date, container_nos,
  packages, gross_weight_kg, etd, eta, arrival_date, port, free_days, cf_agent_id, bill_of_entry_no, bill_of_entry_date,
  assessable_value_bdt, duty_paid_bdt, release_date, doc_invoice, doc_packing_list, doc_bl_awb, doc_coo, doc_insurance, doc_test_cert)
select l.id, a.id, v.mode, v.vsl, v.bl, v.bld::date, v.cntr, v.pkgs, v.gw, v.etd::date, v.eta::date, v.arr::date, v.port, 4,
       (select id from cf_agents limit 1), v.boe, v.boed::date, v.av, 0, v.rel::date, true, true, true, v.coo, v.ins, v.tc
  from (values
   ('SAMPLE-0881-26-0311','NED-EXP-2607-118','sea','MAERSK SEMARANG 2629W','NGB2607280451','2026-07-28','MRKU4471020','1,820 drums',47100,
    '2026-07-28','2026-08-14','2026-08-15','Chattogram','C-48211','2026-08-17',29328000,'2026-08-19',true,true,true),
   ('SAMPLE-0881-26-0419','NED-EXP-2610-031','sea','KOTA LAYANG 0412W','NGB2610020118','2026-10-02','TGHU8812044, TCNU1190562','3,150 drums',80600,
    '2026-10-02','2026-10-14','2026-10-15','Chattogram',null,null,null,null,true,false,true)
  ) v(lc, inv, mode, vsl, bl, bld, cntr, pkgs, gw, etd, eta, arr, port, boe, boed, av, rel, coo, ins, tc)
  join import_lcs l on l.lc_no = v.lc join acceptances a on a.supplier_invoice_no = v.inv;

-- ---------- goods receipts
insert into goods_receipts (grn_no, grn_date, import_lc_id, import_shipment_id, store_location, challan_no)
select v.grn, v.d::date, l.id, s.id, v.loc, v.ch
  from (values
   ('GRN-24-0610','2024-08-18','SAMPLE-0881-24-0101',null,'Yarn store','RSM-DC-24-901'),
   ('GRN-24-0701','2024-10-14','SAMPLE-0881-24-0114',null,'Accessories store','DTA-DC-24-311'),
   ('GRN-26-0711','2026-07-17','SAMPLE-0881-26-0307',null,'Yarn store','RSM-DC-26-1102'),
   ('GRN-26-0802','2026-08-02','SAMPLE-0881-26-0307',null,'Yarn store','RSM-DC-26-1240'),
   ('GRN-26-0820','2026-08-20','SAMPLE-0881-26-0311','NGB2607280451','Dyes & chemical store',null),
   ('GRN-26-0730','2026-07-24','SAMPLE-0881-26-0315',null,'Accessories store','DTA-DC-26-0812'),
   ('GRN-26-1008','2026-10-08','SAMPLE-0881-26-0402',null,'Yarn store','RSM-DC-26-2051')
  ) v(grn, d, lc, bl, loc, ch)
  join import_lcs l on l.lc_no = v.lc
  left join import_shipments s on s.bl_awb_no = v.bl;

insert into grn_items (grn_id, item_id, quantity, unit_code)
select g.id, i.id, v.qty, i.unit_code
  from (values
   ('GRN-24-0610','YRN-30C',500000),
   ('GRN-24-0701','ACC-ML',6000000), ('GRN-24-0701','PKG-PB',6000000), ('GRN-24-0701','PKG-CT',60000),
   ('GRN-26-0711','YRN-30C',102000), ('GRN-26-0802','YRN-30C',96500),
   ('GRN-26-0820','DYE-RX',30000), ('GRN-26-0820','CHM-FA',15200),
   ('GRN-26-0730','ACC-ML',2000000), ('GRN-26-0730','ACC-HT',1500000), ('GRN-26-0730','PKG-PB',2500000), ('GRN-26-0730','PKG-CT',10000),
   ('GRN-26-1008','YRN-26B',220000)
  ) v(grn, item, qty) join goods_receipts g on g.grn_no = v.grn join items i on i.code = v.item;

-- ---------- export bills, invoices, items, BL checks
insert into export_bills (contract_id, bank_id, submission_date, bill_type, bill_ref_no, buyer_acceptance_date,
                          courier_name, courier_awb_no, courier_date, negotiation_date, purchase_amount, purchase_rate)
select (select id from export_contracts where contract_no = v.ml), (select id from banks where short_name='AIBL'),
       v.sub::date, v.typ, v.ref, v.bacc::date, 'DHL', v.awb, v.cd::date, v.negd::date, v.pa, v.pr
  from (values
   ('IKGPL/PAYPER/004/2024','2024-09-24','FDBC','SAMPLE-FDBC-088-24-0915',null,'SAMPLE-1450021','2024-09-25',null,null,null),
   ('IKGPL/PAYPER/004/2024','2024-10-18','FDBC','SAMPLE-FDBC-088-24-1011',null,'SAMPLE-1450388','2024-10-19',null,null,null),
   ('411011484842','2026-07-20','FDBC','SAMPLE-FDBC-088-26-0720',null,'SAMPLE-2260117','2026-07-21',null,null,null),
   ('411011484842','2026-08-30','FDBP','SAMPLE-FDBP-088-26-0830',null,'SAMPLE-2260955','2026-08-31','2026-09-02',650000.00,122.20),
   ('PMK-IKGPL-06-2026','2026-10-15','FDBC','SAMPLE-FDBC-088-26-1015','2026-10-19','SAMPLE-2261402','2026-10-15',null,null,null)
  ) v(ml, sub, typ, ref, bacc, awb, cd, negd, pa, pr);

insert into export_invoices (contract_id, invoice_no, invoice_date, buyer_order_no, exp_no, exp_date, shipping_bill_no,
  shipping_bill_date, port_of_loading, port_of_discharge, final_destination, mode, vessel_voyage, container_no,
  shipping_marks, port_submission_date, forwarder_id, handover_date, handover_cartons, handover_cbm, fcr_no,
  draft_bl_received_date, bl_no, bl_date, bl_collection_date, export_bill_id)
select (select id from export_contracts where contract_no = v.ml), v.inv, v.invd::date, v.po, v.exp, v.invd::date,
       v.sb, v.sbd::date, 'Chattogram, Bangladesh', v.pod, v.pod, 'sea', v.vsl, v.cntr, v.marks, v.sbd::date,
       (select id from freight_forwarders where name = v.ff), v.hod::date, v.ctn, v.cbm, v.fcr,
       v.dbl::date, v.bl, v.bld::date, v.blc::date, (select id from export_bills where bill_ref_no = v.bill)
  from (values
   ('IKGPL/PAYPER/004/2024','IKGPL/PAYPER/0915/2024','2024-09-08','2024-20015','1088-019215-2024','C-701122','2024-09-11','La Spezia, Italy','SOL PROMISE V-2437S','MSNU8408220','IBRAHIM KNIT PAYPER / SUNSET','Total Transportation Ltd.','2024-09-10',6000,520.0,null,'2024-09-12','TTL0981204','2024-09-15','2024-09-20','SAMPLE-FDBC-088-24-0915'),
   ('IKGPL/PAYPER/004/2024','IKGPL/PAYPER/1011/2024','2024-10-04','2024-20019','1088-021774-2024','C-713390','2024-10-06','La Spezia, Italy','MSC MILAN V-IS441A','MSCU7712045','IBRAHIM KNIT PAYPER / SUNSET','Total Transportation Ltd.','2024-10-05',1500,130.0,null,'2024-10-08','TTL0985511','2024-10-10','2024-10-15','SAMPLE-FDBC-088-24-1011'),
   ('411011484842','IKGPL/IWS/0612/2026','2026-07-06','2026-20031','1088-006120-2026','C-221340','2026-07-08','La Spezia, Italy','SOL PROMISE V-2627S','MSNU8410375','IBRAHIM KNIT PAYPER / SUNSET','Total Transportation Ltd.','2026-07-07',3750,330.0,null,'2026-07-08','TTL106102','2026-07-10','2026-07-15','SAMPLE-FDBC-088-26-0720'),
   ('411011484842','IKGPL/IWS/0745/2026','2026-08-18','2026-20044','1088-007450-2026','C-260118','2026-08-20','La Spezia, Italy','SOL PROMISE V-2633S','MSNU8412290','IBRAHIM KNIT PAYPER / SUNSET','Total Transportation Ltd.','2026-08-19',5250,460.0,null,'2026-08-20','TTL106377','2026-08-22','2026-08-27','SAMPLE-FDBP-088-26-0830'),
   ('PMK-IKGPL-06-2026','IKGPL/PRI/1012/2026','2026-10-08','B13474594','1088-010120-2026','C-311902','2026-10-10','Rotterdam, Netherlands','CELSIUS ESSEN 041S','TCKU6578070','PRIMARK / KIMBALL 11829','APM Global Logistics Bangladesh Ltd (Maersk)','2026-10-09',4170,470.0,'FCR001190211','2026-10-11','FCR001190211','2026-10-12','2026-10-14','SAMPLE-FDBC-088-26-1015'),
   ('PMK-IKGPL-06-2026','IKGPL/PRI/1034/2026','2026-10-18','B13475120','1088-010344-2026','C-318455','2026-10-19','Valencia, Spain','MOUNT CAMERON 0442S','MRSU5871204','PRIMARK / KIMBALL 11904','APM Global Logistics Bangladesh Ltd (Maersk)','2026-10-19',2500,280.0,'FCR001190588','2026-10-20',null,null,null,null)
  ) v(ml, inv, invd, po, exp, sb, sbd, pod, vsl, cntr, marks, ff, hod, ctn, cbm, fcr, dbl, bl, bld, blc, bill);

insert into export_invoice_items (invoice_id, style_no, description, hs_code, color, quantity_pcs, unit_price,
                                  cartons, carton_from, carton_to, net_weight_kg, gross_weight_kg, cbm)
select i.id, v.style, v.descr, '6109.10.00', v.color, v.qty, v.price, v.ctn, 1, v.ctn, v.nw, v.gw, v.cbm
  from (values
   ('IKGPL/PAYPER/0915/2024','SUNSET MEN','Men''s short sleeve round neck T-shirt, 100% cotton, 155-160 GSM','Assorted',480000,1.63,6000,76800,82800,520.0),
   ('IKGPL/PAYPER/1011/2024','SUNSET LADY','Ladies short sleeve round neck T-shirt, 100% cotton, 155-160 GSM','Assorted',120000,1.63,1500,19200,20700,130.0),
   ('IKGPL/IWS/0612/2026','SUNSET MEN','Men''s short sleeve round neck T-shirt, 100% cotton','Assorted',300000,1.63,3750,48000,51750,330.0),
   ('IKGPL/IWS/0745/2026','SUNSET MEN','Men''s short sleeve round neck T-shirt, 100% cotton','Assorted',250000,1.63,3125,40000,43125,274.0),
   ('IKGPL/IWS/0745/2026','SUNSET KID','Kids short sleeve round neck T-shirt, 100% cotton','Assorted',170000,1.63,2125,23800,26800,186.0),
   ('IKGPL/PRI/1012/2026','11829','Men''s wear T-shirt, 100% cotton knitted','Black/White',500000,1.25,4170,52000,56170,470.0),
   ('IKGPL/PRI/1034/2026','11904','Women''s T-shirt, 100% cotton knitted','Assorted',300000,1.25,2500,30600,33100,280.0)
  ) v(inv, style, descr, color, qty, price, ctn, nw, gw, cbm)
  join export_invoices i on i.invoice_no = v.inv;

insert into bl_checks (export_invoice_id, check_date, draft_ref, results, overall_result, remarks)
select i.id, v.d::date, v.ref, v.res::jsonb, v.overall, v.rem
  from (values
   ('IKGPL/PRI/1012/2026','2026-10-11','FCR001190211',
    '[{"field":"shipper","label":"Shipper","result":"pass"},{"field":"consignee","label":"Consignee","result":"pass"},{"field":"notify","label":"Notify party","result":"pass"},{"field":"cartons","label":"Cartons","result":"pass"},{"field":"gross_wt","label":"Gross weight","result":"pass"}]',
    'pass','All fields match invoice and contract'),
   ('IKGPL/PRI/1034/2026','2026-10-20','FCR001190588',
    '[{"field":"shipper","label":"Shipper","result":"pass"},{"field":"consignee","label":"Consignee","expected":"TO THE ORDER OF AL-ARAFAH ISLAMI BANK LTD","draft":"AL-ARAFAH ISLAMI BANK LTD","result":"discrepancy","note":"\"To the order of\" missing"},{"field":"gross_wt","label":"Gross weight","expected":"33100.000","draft":"31300.000","result":"discrepancy","note":"Typo in draft"}]',
    'discrepancy','Sent correction to Maersk 20-Oct-2026')
  ) v(inv, d, ref, res, overall, rem) join export_invoices i on i.invoice_no = v.inv;

-- ---------- realizations (Payper S/C 2024 bills)
insert into realizations (export_bill_id, realization_date, realized_amount, exchange_rate, erq_pct, is_final, prc_no, prc_date)
select b.id, v.d::date, v.amt, v.rate, 7.5, true, v.prc, v.prcd::date
  from (values
   ('SAMPLE-FDBC-088-24-0915','2024-12-20',781200.00,120.00,'SAMPLE-PRC-24-1220','2024-12-26'),
   ('SAMPLE-FDBC-088-24-1011','2025-01-15',195160.00,120.00,'SAMPLE-PRC-25-0115','2025-01-22')
  ) v(bill, d, amt, rate, prc, prcd) join export_bills b on b.bill_ref_no = v.bill;

insert into realization_deductions (realization_id, reason, amount, remarks)
select r.id, 'foreign_bank_charges', v.amt, 'UniCredit charges'
  from (values ('SAMPLE-PRC-24-1220', 1200.00), ('SAMPLE-PRC-25-0115', 440.00)) v(prc, amt)
  join realizations r on r.prc_no = v.prc;

insert into realization_distributions (realization_id, head, amount, remarks)
select r.id, v.head, v.amt, v.rem
  from (values ('SAMPLE-PRC-24-1220','erq',58590.00,'7.5% ERQ'), ('SAMPLE-PRC-24-1220','cd_account',22610.00,'Balance to CD'),
               ('SAMPLE-PRC-25-0115','erq',14637.00,'7.5% ERQ')) v(prc, head, amt, rem)
  join realizations r on r.prc_no = v.prc;

-- ---------- import payments (BTB paid from proceeds; sight LC via EDF)
insert into import_payments (acceptance_id, payment_date, amount, exchange_rate, bank_charges_bdt, source, realization_id, reference)
select a.id, v.d::date, v.amt, v.rate, v.chg, v.src, (select id from realizations where prc_no = v.prc), v.ref
  from (values
   ('RSM-24-7781','2024-12-23',700000.00,120.00,8500,'export_proceeds','SAMPLE-PRC-24-1220','SAMPLE-PAY-24-1223'),
   ('RSM-24-7781','2024-12-23',1150000.00,120.00,0,'own_fund',null,'SAMPLE-PAY-24-1223B'),
   ('DTA-24-2290','2025-01-18',180000.00,120.00,2500,'export_proceeds','SAMPLE-PRC-25-0115','SAMPLE-PAY-25-0118'),
   ('DTA-24-2290','2025-01-18',30000.00,120.00,0,'own_fund',null,'SAMPLE-PAY-25-0118B'),
   ('NED-EXP-2610-031','2026-10-14',410000.00,122.20,15000,'edf',null,'SAMPLE-EDF-26-1014')
  ) v(inv, d, amt, rate, chg, src, prc, ref) join acceptances a on a.supplier_invoice_no = v.inv;

update import_lcs set status = 'closed' where lc_no in ('SAMPLE-0881-24-0101', 'SAMPLE-0881-24-0114');

-- ---------- bank loans (EDF used for the sight LC, PC against Primark)
insert into bank_loans (bank_id, loan_type, loan_ref, contract_id, import_payment_id, loan_date, currency, amount, due_date)
values
 ((select id from banks where short_name='AIBL'),'EDF','SAMPLE-EDF-26-1014',
  (select id from export_contracts where contract_no='PMK-IKGPL-06-2026'),
  (select id from import_payments where reference='SAMPLE-EDF-26-1014'),'2026-10-14','USD',410000.00,'2027-04-12'),
 ((select id from banks where short_name='AIBL'),'PC','SAMPLE-PC-26-0901',
  (select id from export_contracts where contract_no='PMK-IKGPL-06-2026'), null,'2026-09-01','BDT',30000000.00,'2027-02-28');

-- ---------- customs bond
insert into bond_licenses (license_no, issue_date, valid_from, valid_to, remarks) values
 ('SAMPLE-BOND-0123/CUS-BOND/2025','2025-06-25','2025-07-01','2027-06-30','SAMPLE - replace with actual license');

insert into bond_opening_balances (bond_license_id, item_id, as_of_date, quantity, remarks)
select (select id from bond_licenses limit 1), i.id, '2026-07-01', v.qty, 'Audited balance (SAMPLE)'
  from (values ('YRN-30C',15000), ('DYE-RX',1200), ('CHM-FA',800), ('ACC-ML',50000),
               ('ACC-HT',20000), ('PKG-PB',40000), ('PKG-CT',9000)) v(item, qty)
  join items i on i.code = v.item;

-- ---------- cash incentive rates (SAMPLE - verify against current FE circulars)
insert into incentive_rates (scheme, product_category, market, rate_pct, effective_from, effective_to, circular_ref, remarks) values
 ('Alternative Cash Assistance','knit','all',4.000,'2023-07-01','2024-01-31','SAMPLE','Verify with Bangladesh Bank FE circular'),
 ('Alternative Cash Assistance','knit','all',3.000,'2024-02-01','2024-06-30','SAMPLE','Verify with Bangladesh Bank FE circular'),
 ('Alternative Cash Assistance','knit','all',1.500,'2024-07-01',null,'SAMPLE','Verify with Bangladesh Bank FE circular'),
 ('Special Cash Incentive (RMG)','all','all',1.000,'2023-07-01','2024-01-31','SAMPLE','Verify with Bangladesh Bank FE circular'),
 ('Special Cash Incentive (RMG)','all','all',0.500,'2024-02-01','2024-06-30','SAMPLE','Verify with Bangladesh Bank FE circular'),
 ('Special Cash Incentive (RMG)','all','all',0.300,'2024-07-01',null,'SAMPLE','Verify with Bangladesh Bank FE circular');

insert into incentive_claims (realization_id, scheme, claim_no, doc_application, doc_invoice, doc_packing_list, doc_exp,
  doc_bl, doc_prc, doc_ud, doc_input_certificate, doc_auditor_cert, submission_date, auditor_cert_date,
  claim_status, received_amount_bdt, received_date)
select r.id, 'Alternative Cash Assistance', v.no, true, true, true, true, true, true, true, true, v.aud is not null,
       v.sub::date, v.aud::date, v.st, v.recv, v.recd::date
  from (values
   ('SAMPLE-PRC-24-1220','SAMPLE-CI-24-031','2025-01-20','2025-04-10','received',1406160.00,'2025-06-30'),
   ('SAMPLE-PRC-25-0115','SAMPLE-CI-25-007','2025-02-15',null,'under_audit',null,null)
  ) v(prc, no, sub, aud, st, recv, recd) join realizations r on r.prc_no = v.prc;
