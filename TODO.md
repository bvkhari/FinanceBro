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
- Pilihan Combined disimpan dalam browser (macam pilihan profile), jadi kekal lepas reload. Diuji: Combined → reload kekal Combined, Personal → reload kekal Personal
- Dashboard tab Expenses masih kira bayaran hutang sebagai expense (step 9)

## Fasa 3: Logik duit ✅ *siap 2026-10-10*

Keputusan reka bentuk:
- Pembelian secara hutang (BNPL, invois supplier) direkod sebagai **expense tanpa kesan tunai** (`cash_effect = false`) dan dipautkan ke hutang tu. Ia dikira dalam expense bulanan, tapi tak kurangkan baki tunai
- Bila instalment dibayar, transaksi `Debt Repayment` kurangkan tunai, tapi **tak** dikira sebagai expense (pembelian dah dikira). Hanya `Interest & Fees` masuk expense
- Jadi setiap ringgit dikira sekali: expense masa beli, tunai masa bayar
- Formula dan andaian dipaparkan dalam UI, bukan disorok
- Ufuk masa unjuran: hujung bulan ni (sama dengan Debt Dashboard)

- [x] **9. Cash flow tanpa double-count**
  - [x] Buang double-count dalam `markCommitmentPaid` *(Fasa 2: bil hanya boleh ditanda paid sekali, dan BNPL/loan dah keluar dari `commitments`)*
  - [x] Transaksi `Debt Repayment` tidak dikira sebagai expense bulanan (hanya `Interest & Fees`), dalam kad Spent, budget, carta kategori dan carta harian
  - [x] Principal kurangkan hutang, faedah dan fi direkod sebagai expense *(Fasa 1: `record_debt_payment` dah asingkan principal dan faedah)*
  - [x] Pembelian yang dah direkod sebagai expense tidak dikira semula
    - [x] Kolum `transactions.cash_effect` dan `debts.purchase_transaction_id`
    - [x] Trigger baki akaun abaikan transaksi tanpa kesan tunai
    - [x] Borang Add debt: pilihan "rekod pembelian sebagai expense" (kategori, tarikh)
    - [x] Senarai transaksi tunjuk label "On credit"
  - [x] Invois supplier dipautkan ke purchase/expense (seed: 3 invois Kopi Senja dan Shopee PayLater dipautkan ke pembelian)
  - [x] Available cash = starting cash + income received − cash expenses paid − debt repayments paid, dengan pecahan untuk bulan ni
  - [x] Projected cash hujung bulan = available cash + expected income − bil belum bayar − instalment hutang belum bayar. Income disahkan dan belum disahkan ditunjuk berasingan
  - [x] Tidak tolak seluruh outstanding debt, hanya yang due
  - [x] Chat (`/financebro-ai`) guna angka yang sama (bil dan instalment due hujung bulan)
  - [x] Unit test untuk semua formula, dan integration test untuk trigger baki
  - Diuji dalam browser (Personal, 10 Okt): bayar instalment RM89.90 → Spent kekal RM245.52, tunai RM720 → RM630.10, projected kekal RM442.40. Tambah BNPL RM120 dengan pembelian → Spent RM365.52, tunai kekal RM630.10. Chat tunjuk angka sama dengan Debt Dashboard
  - Seed: 8 hutang dipautkan ke pembelian on-credit (invois supplier, BNPL, statement kad). Expense September Kopi Senja jadi RM29,443 (lebih dari revenue) sebab pembelian on-credit dikira masa beli
- [x] **10. Edit instalment akan datang** tanpa ubah yang dah bayar
  - [x] Edit tarikh dan amaun instalment yang belum dibayar
  - [x] Instalment partial: amaun tak boleh kurang dari yang dah dibayar
  - [x] Instalment yang dah paid dan cancelled dikunci
  - [x] Batalkan instalment yang belum ada bayaran
  - [x] Tambah instalment / sambung jadual bila ada baki belum dijadualkan (guna `planScheduleExtension`)
  - [x] Jadual semula baki (tukar frequency dan amaun) tanpa sentuh sejarah bayaran
  - [x] Semua perubahan melalui function SQL, dengan integration test
  - Diuji dalam browser: Shopee PayLater dijadual semula ke setiap dua minggu RM75 (4 bayaran, 20 Okt–1 Dis), instalment 17 Nov dibatalkan (amaran RM75 keluar), Add instalments tambah 15 Dis (amaran hilang). Baris yang dah paid dikunci
  - 5 integration test baru: edit, partial, batal, reschedule, dan reschedule yang bertembung dengan tarikh paid (tiada apa-apa berubah)
- [x] **11. In-app reminder** untuk bayaran yang dah dekat
  - [x] Notifikasi untuk instalment hutang overdue dan due dalam 3 hari
  - [x] Label jelas "in-app" sahaja (tiada notifikasi luar yang dihantar)
  - Diuji dalam browser (10 Okt): Personal 3 peringatan (sewa esok, SPayLater 12 Okt, CelcomDigi 13 Okt; headphones 14 Okt tak masuk sebab 4 hari). Business: Unifi "overdue by 3 days", Kopi Bumi dan Farm Fresh (Supplier invoice)

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
