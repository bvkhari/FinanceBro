# FinanceBro AI: To-Do List

`[x]` = siap dan dah test · `[ ]` = belum · *(separuh: …)* = ada sikit, tapi belum ikut spec

## Fasa 0: Asas (siap)

- [x] Branch `continuous-dev` dibuat
- [x] Schema Supabase ikut Doc 4 (8 table, Realtime, trigger untuk baki akaun)
- [x] Seed data contoh: Kopi Senja dan Aina Rahman (`npm run seed`, boleh jalan berulang kali)
- [x] App baca dan tulis data Supabase, mock data dibuang
- [x] Dashboard update live bila data berubah (Realtime)
- [x] Env vars Supabase di Vercel, deploy ke `beta` dan `main`
- [x] CLAUDE.md dikemas kini

## Fasa 1: Asas data hutang ✅ *siap 2026-10-10*

Keputusan reka bentuk:
- 3 table baru: `debts` (hutang), `debt_instalments` (jadual bayaran) dan `debt_payments` (rekod bayaran sebenar, dipautkan ke `transactions`)
- `commitments` kekal untuk bil biasa (sewa, TNB, Unifi, telefon). BNPL, loan, kad kredit dan invois supplier dipindah ke `debts`
- Status overdue dikira dari tarikh due (tak disimpan), supaya tak jadi basi
- Next due date dikira dari instalment terawal yang belum bayar (tak disimpan dua kali)
- Hutang personal dan business berasingan ikut `profile_id`

- [x] **1. Migration `debts`, `debt_instalments` dan `debt_payments`**
  - [x] Hutang personal: BNPL (Shopee/Grab PayLater), kad kredit, personal loan, car loan, housing loan, student loan, pinjam family/kawan, lain-lain
  - [x] Hutang business: business loan, kad kredit business, equipment financing, invois supplier, overdraft, lain-lain
  - [x] Medan: nama/provider, jenis, amaun asal, baki semasa, amaun bayaran, frequency, next due date, kadar faedah (optional), tarikh mula/tamat (optional), status, nota, no. invois/rujukan
  - [x] Penanda `is_sample` untuk rekod contoh (fictional)
  - [x] Seed hutang contoh, termasuk contoh spec (Shopee PayLater RM300, RM100 × 3 bulan) dan satu hutang tak tetap (pinjam kawan)
  - [x] Pindah SPayLater, equipment loan, kad kredit dan invois supplier dari `commitments` ke `debts`, dan kekalkan tuning safe-to-spend
- [x] **2. Types, `db.ts` dan context untuk hutang**
  - [x] Baca hutang dan instalment untuk setiap profile
  - [x] Tambah hutang baru (hutang dan jadual disimpan serentak)
  - [x] Edit butiran hutang
  - [x] Page `/debts` asas: senarai hutang, label *Sample*, borang tambah hutang
- [x] **3. Penjana jadual bayaran**
  - [x] Frequency: one-time, weekly, every two weeks, monthly, yearly
  - [x] Bulan pendek: due 31 hb jadi 28/29 Feb, kemudian balik 31 Mac
  - [x] Instalment terakhir ambil baki (contoh RM250 ÷ RM100 jadi 100, 100, 50)
  - [x] Jadual tak tetap (user masuk amaun dan tarikh sendiri)
  - [x] Jana semula tanpa duplicate, sejarah bayaran kekal
  - [x] Test runner (vitest) dan unit test
- [x] **4. Rekod bayaran**
  - [x] Bayar penuh: baki berkurang (RM300 → RM200 → … → RM0), hutang jadi `paid_off`
  - [x] Partial payment: simpan amaun dibayar dan baki due
  - [x] Baki hanya berubah selepas bayaran disahkan
  - [x] Tiada duplicate repayment atau duplicate transaksi (idempotency key dan row lock)
  - [x] Bayar lebih dari baki instalment ditolak
  - [x] Pautan hutang → instalment → bayaran → transaksi
  - [x] Butang "Record payment" (penuh atau partial) dalam page `/debts`
  - [x] Integration test pada database

Nota dari test Fasa 1:
- Test: 14 unit test (jadual) dan 7 integration test (bayaran) lulus. Diuji dalam browser: partial RM40 (double-click direkod sekali sahaja), baki RM60, tambah hutang baru, edit butiran, mode Business
- Bayaran hutang masuk `transactions` dengan kategori `Debt Repayment`, jadi dashboard masih kira dia sebagai *expense* bulanan. Itu dibetulkan dalam step 9
- Kad Debt dalam dashboard masih guna `commitments`, jadi BNPL, loan dan invois dah tak keluar situ sampai step 5–6 siap
- Jadual guna amaun tetap (tanpa pengiraan faedah). Kalau ada faedah, user masukkan bahagian faedah masa rekod bayaran. Pengiraan faedah ikut kadar sebenar ada dalam step 12

## Fasa 1.1: Pembetulan Fasa 1 ✅ *siap 2026-10-10*

- [x] **Bug 1:** hutang `paid_off` masih ada instalment `scheduled` → batalkan instalment yang belum dibayar bila baki jadi RM0, dan betulkan data sedia ada
- [x] **Bug 2:** tarikh bayaran masa depan diterima → tolak tarikh selepas hari ni (waktu Malaysia)
- [x] **Bug 3:** kadar faedah tak boleh dikosongkan dalam Edit details
- [x] **Amaran 4:** hutang aktif yang bakinya tak cukup dijadualkan → tunjuk "RMx belum dijadualkan"
- [x] Test baru untuk bug 1 dan 2
- Disahkan: probe database (rollback) untuk bug 1–2, browser untuk bug 3 dan amaran 4. 23 test lulus

## Fasa 2: UI hutang ✅ *siap 2026-10-10*

Keputusan reka bentuk:
- Senarai bayaran gabungkan **instalment hutang** dan **bil** (`commitments`), sebab soalan user ialah "siapa aku kena bayar", bukan "hutang mana"
- Semua kiraan (countdown, filter, jumlah) dalam function TS tulen di `src/lib/debt/payments.ts` dengan unit test. Page cuma paparkan
- Countdown dikira dari tarikh due yang disimpan, ikut tarikh (bukan jam), jadi "Due tomorrow" tak berubah ikut masa
- "Available cash selepas commitments" = baki semasa − bayaran yang belum dibayar sampai hujung bulan ni (instalment + bil, termasuk overdue). Andaian ni ditulis dalam UI. Formula penuh cash flow dalam step 9
- Scope Personal / Business / Combined: satu kawalan dalam Dashboard Debt dan page Debts. Combined tunjuk rekod dua-dua profile dengan label, tapi rekod tetap berasingan

- [x] **5. Upcoming Payments** (tab "Payments" dalam page `/debts`)
  - [x] Kepada siapa, RM, tarikh tepat, countdown ("Due today", "Due tomorrow", "Due in 2 days", "Overdue by 3 days"), kategori, frequency, status (upcoming/partly paid/paid/overdue/cancelled)
  - [x] Susun ikut tarikh due terdekat
  - [x] Filter: semua, hari ni, 7 hari, bulan ni, overdue, paid
  - [x] Jumlah untuk tempoh dipilih (tidak kira paid dan cancelled; partial kira baki sahaja)
  - [x] Butang Record payment (hutang) dan Mark paid (bil) terus dari senarai
  - [x] Unit test untuk countdown, filter dan jumlah
- [x] **6. Debt Dashboard** (workspace Debt dalam dashboard)
  - [x] Total outstanding debt
  - [x] Due bulan ni
  - [x] Due 7 hari akan datang
  - [x] Total overdue
  - [x] Bilangan hutang aktif
  - [x] Next payment
  - [x] Available cash selepas commitments (dengan andaian ditulis)
  - [x] Beza yang jelas antara outstanding debt dan repayment due
  - [x] Senarai "Up next" guna data hutang dan bil
  - [x] Unit test untuk semua jumlah
- [x] **7. Paparan jadual bayaran setiap hutang** (tarikh due, tarikh bayar, amaun, status)
- [x] **8. Switch Personal / Business / Combined**
  - [x] Combined: jumlah merentas dua profile, setiap rekod ada label Personal/Business
  - [x] Rekod bayaran dalam view Combined kemas kini profile yang betul

Nota dari test Fasa 2:
- Test: 15 unit test baru untuk countdown, filter dan jumlah (38 semua sekali, lulus)
- Diuji dalam browser pada 10 Okt, semua nombor sama dengan kiraan tangan:
  - Personal: outstanding RM1,014.80, due bulan ni RM379.60, 7 hari RM235.40, available −RM157.60
  - Business: RM40,250, RM7,820, RM3,400, available −RM2,439, Unifi "Overdue by 3 days"
  - Combined: RM41,264.80, RM8,199.60, RM3,635.40, 11 hutang, available −RM2,596.60
  - Payments "Next 7 days" (Combined) RM7,333.40, 9 bayaran
- Bayar hutang Personal dari view Combined semasa profile aktif Business: baki betul (RM359.60 → RM269.70)
- Mark paid bil dengan double-click: satu transaksi sahaja (`markCommitmentPaid` kini hanya rekod sekali)
- Layout telefon: butang aksi turun ke baris bawah, filter boleh scroll
- Combined tak disimpan bila reload page; dia balik ke profile aktif
- Dashboard tab Expenses masih kira bayaran hutang sebagai expense (step 9)

## Fasa 3: Logik duit

- [ ] **9. Cash flow tanpa double-count**
  - [x] Buang double-count dalam `markCommitmentPaid` *(Fasa 2: bil hanya boleh ditanda paid sekali, dan BNPL/loan dah keluar dari `commitments`)*
  - [ ] Transaksi `Debt Repayment` tidak dikira sebagai expense bulanan (hanya `Interest & Fees`)
  - [ ] Principal kurangkan hutang, faedah dan fi direkod sebagai expense
  - [ ] Pembelian yang dah direkod sebagai expense tidak dikira semula
  - [ ] Invois supplier dipautkan ke purchase/expense
  - [ ] Available cash = starting cash + income received − cash expenses paid − debt repayments paid
  - [ ] Projected cash (expected income, unpaid expenses, upcoming repayments, andaian dinyatakan)
  - [ ] Tidak tolak seluruh outstanding debt, hanya yang due
- [ ] **10. Edit instalment akan datang** tanpa ubah yang dah bayar
- [ ] **11. In-app reminder** untuk bayaran yang dah dekat *(separuh: notifikasi overdue dan due dalam 3 hari dah ada untuk `commitments`)*

## Fasa 4: Bonus

- [ ] **12. Prioritisation dan affordability**
  - [ ] Paling cepat due, overdue, kadar faedah tertinggi (jika diketahui), bayaran minimum
  - [ ] Baki tunai dianggarkan selepas bayaran berjadual
  - [ ] Senario bayar lebih RM100/RM200 (guna kadar sebenar, tak reka savings)
- [ ] **13. Report dan export**
  - [ ] Hutang ikut provider, ikut kategori
  - [ ] Bayaran dibuat dalam tempoh dipilih
  - [ ] Upcoming, overdue, baki komitmen
  - [ ] Sejarah perubahan baki hutang
  - [ ] Export CSV/Excel
- [ ] **14. Debt Agent** *(separuh: chat sekarang guna keyword matching, belum ada soalan hutang)*
  - [ ] Tool kira nombor (code kira, LLM tak reka nombor)
  - [ ] Jawab soalan: berapa hutang, hutang Shopee, siapa kena bayar minggu ni, due esok, bayaran bulan ni, overdue, baki selepas bulan ni, mampu bayar extra RM200, hutang supplier business
  - [ ] Tanya user bila maklumat tak cukup
  - [ ] Terangkan cara kiraan
