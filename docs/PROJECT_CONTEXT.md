# PROJECT_CONTEXT — CRM App

> Tài liệu ngữ cảnh cho người và AI cùng làm việc trên dự án. Cập nhật khi kiến trúc thay đổi.
> Nhãn: **[ĐX]** đã đọc code và xác minh · **[GT]** giả thuyết · **[THIẾU]** chưa đủ dữ liệu · **[GIẢ ĐỊNH]** quy tắc nghiệp vụ tạm, chờ đặc tả.
> Trạng thái: kết quả Phase 00 (chỉ phân tích). Chưa có thay đổi mã nguồn nào.

## 1. Tổng quan

CRM nội bộ giao diện tiếng Việt. Phân hệ đã có: Khách hàng, Lead, Nhóm khách hàng, Lịch sử tương tác, Cơ hội bán hàng.
Phân hệ đang có menu nhưng chưa có trang (404): KPI, Công việc, Doanh số, Hợp đồng, Báo giá & Đơn hàng, Dự án, Chăm sóc KH,
Sản phẩm & Dịch vụ, Thu chi & Công nợ, Nhân sự, Báo cáo, Thông báo, Cài đặt (`lib/dashboard-data.ts:81-87`).

Stack **[ĐX]** (`package.json`): Next.js 16.4.3 (App Router) · React 19.3.0 · TypeScript strict · Tailwind v4
(`@tailwindcss/turbopack`) · Firebase Auth + Firestore (client `firebase`, server `firebase-admin`) · recharts · lucide-react ·
read-excel-file / write-excel-file.

> `AGENTS.md`: phiên bản Next này có thay đổi phá vỡ. Đọc `node_modules/next/dist/docs/` trước khi viết code Next.js.
> `next.config.ts` bật `cacheComponents` và `partialPrefetching`: dữ liệu động cần bọc `Suspense` **[GT]**.

## 2. Chạy dự án

```
npm install
npm run dev | build | start | lint      # không có script test
node scripts/set-user-scope.mjs <email> <departmentId> [branchId]   # gán phòng ban (script đọc ./service-account.json)
```

Biến môi trường (`.env.local`, KHÔNG commit, KHÔNG gửi cho AI):
- Client: `NEXT_PUBLIC_FIREBASE_{API_KEY,AUTH_DOMAIN,PROJECT_ID,STORAGE_BUCKET,MESSAGING_SENDER_ID,APP_ID}`
- Server: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (`\n` được thay bằng xuống dòng thật)

Triển khai: cần runtime Node.js (Vercel, VPS, Cloud Run); không dùng hosting tĩnh. Rules dán thủ công vào Console
(không có `firebase.json`, `firestore.indexes.json`, CI **[THIẾU]**).

## 3. Cấu trúc thư mục

```
app/            route (App Router) + app/api/** (REST)
components/     <miền>/ (activities, auth, customers, dashboard, groups, layout, leads, opportunities, ui)
contexts/       AuthContext.tsx (đăng nhập, hồ sơ users/{uid})
lib/            truy cập dữ liệu phía client (customers, leads, groups, activities, contacts, ...)
                *-core.ts = logic thuần dùng chung server/client (opportunity-core, customer-io-core, activity-core)
lib/server/     firebase-admin, auth (authenticate), http (route, readJson), errors (HttpError), opportunities
types/          kiểu dữ liệu + nhãn tiếng Việt
firestore.rules
```

Khởi chạy: `app/layout.tsx` bọc `AuthProvider`; `app/page.tsx` chuyển `/` → `/dashboard`.
Bố cục có đăng nhập: `components/layout/AppShell.tsx` (`AuthGuard` + `Sidebar` + `Header`). `app/dashboard/layout.tsx` đang chép lại
nội dung AppShell (trùng lặp).

## 4. Hai kiểu truy cập dữ liệu (quan trọng)

| | (A) Client → Firestore trực tiếp | (B) Client → REST → firebase-admin |
|---|---|---|
| Dùng cho | customers, leads, contacts, customerGroups, customerGroupMembers, activities, counters | opportunities (+history), users/assignable |
| Bảo vệ bằng | `firestore.rules` | code server (`lib/server/*`) |
| Mẫu | `lib/customers.ts`, `groups.ts`... | `app/api/opportunities/**` → `lib/server/opportunities.ts` |

Mọi API: `Authorization: Bearer <Firebase ID token>`. `authenticate()` (`lib/server/auth.ts:8-21`) xác minh token rồi nạp role,
`organizationId`, `departmentId` từ `users/{uid}` (không tin dữ liệu quyền từ trình duyệt).
`route()` (`lib/server/http.ts`) bọc xác thực + chuyển `HttpError` thành `{ error: { code, message } }`.

**Quy ước cho phân hệ mới: dùng kiểu (B)**, khóa collection với trình duyệt bằng rules (`allow read, write: if false`), như `opportunities`.

Mẫu nghiệp vụ chuẩn (tham chiếu `lib/server/opportunities.ts`):
- `mutate()` (109-121): đọc trong transaction → kiểm phạm vi/quyền/`version` → ghi thay đổi + lịch sử cùng lúc.
- `version` (khóa lạc quan, lỗi 409) và `requestId` (id tài liệu cố định để chống tạo trùng khi gửi lại).
- Lịch sử thay đổi trong subcollection `history`, mỗi bản ghi gồm `type, changes[{field,label,from,to}], note, actor, at`.

## 5. Dữ liệu & quy ước

- Mọi bản ghi có `organizationId`; xóa mềm bằng `deletedAt`; mã tự sinh qua `counters/{org}_{loại}` trong transaction:
  KH#####, LD#####, NH###, HD#####, OP#####.
- Tiền: VND, số nguyên (`Number.isSafeInteger`), định dạng bằng `formatVnd` / `compactVnd`.
- Khách hàng có thể thuộc **nhiều** nhóm (`customerGroupMembers`, id `groupId_customerId`). `Customer.groupName` là chuỗi cũ, song song **[ĐX]**.
- `isVip` là cờ trên khách hàng, hiện Sales sửa được **[ĐX]**.
- Chưa có collection tổ chức / phòng ban / chi nhánh: `departmentId` chỉ là chuỗi **[ĐX]**.

## 6. Đăng nhập & phân quyền

- Email/mật khẩu + Google. Hồ sơ `users/{uid}` phải tạo sẵn; không có code tạo user **[THIẾU]**.
- Roles: `super_admin, director, manager, sales, operations, accountant, customer_service`.
- Phân quyền cơ hội: `lib/opportunity-core.ts` (`scopeOf`, `can`, `assignable`) — **[GIẢ ĐỊNH]**.
- `AuthGuard` có tham số `roles` nhưng chưa nơi nào dùng. Quyền thật nằm ở rules và API.
- Khi đổi/ thêm role: đồng bộ `types/user.ts`, `lib/server/auth.ts:5`, các file `*-core.ts`, `firestore.rules`.
- `isSuperAdmin()` trong rules đọc custom claim `token.role` **[GT]** chưa được gán ở đâu → rules mới cần dùng `me().role` (đọc `users/{uid}`).

## 7. Quy ước code

- Chuỗi giao diện tiếng Việt; logic thuần đặt trong `*-core.ts` (không import Firebase) để dùng chung và kiểm thử.
- Giao diện: Tailwind, bảng dữ liệu + thẻ thống kê + tìm/lọc; form dùng `Group`/`L` cục bộ; hộp thoại dùng `Modal`.
- Nhập/xuất: `parseCsv`, `toCsv`, `safeCell`, `norm` (`lib/customer-io-core.ts`); `readMatrix`, `downloadXlsx/Csv` (`lib/customer-io.ts`).
- Lỗi UI hiển thị trong `role="alert"`; thao tác ghi dùng cờ `busy` để chặn bấm đúp.

## 8. Nợ kỹ thuật & rủi ro hiện biết

1. **Bảo mật:** file khóa service account nằm trong thư mục dự án; `.gitignore` không chặn `*.json`. Phải xoay khóa; thêm quy tắc ignore.
2. **Build:** `components/dashboard/Charts.tsx:28,42` còn lỗi kiểu `Tooltip formatter` (README bước 5) → `next build` nhiều khả năng thất bại **[GT]**.
3. **CSS:** `globals-append.css` (đặt lại màu viền mặc định Tailwind v4) **chưa được gộp vào** `app/globals.css` **[ĐX]** → các lớp `border`
   không kèm màu có thể hiển thị viền đen **[GT]**. Ngoài ra `globals.css` có nhánh dark-mode đổi nền body trong khi component dùng màu sáng cố định; font Geist khai báo nhưng không nạp (đang dùng Arial).
4. **Dashboard** là dữ liệu giả (`lib/dashboard-data.ts`); tên người dùng ở `Header` hard-code; mục "Đăng xuất" chưa có handler.
5. **Phạm vi dữ liệu không nhất quán:** cơ hội theo owner/phòng ban; khách hàng, lead, tương tác chỉ theo `organizationId`.
   Sales sửa được mọi khách hàng và đổi được nhóm khách hàng (`firestore.rules:21-23,51-57`).
6. `counters` cho client ghi tự do (`rules:77-79`) → có thể gây trùng mã.
7. **Hiệu năng:** danh sách khách hàng/lead/tương tác/thành viên nhóm tải toàn bộ org về trình duyệt rồi lọc và phân trang tại client
   (`lib/customers.ts:8`, `app/customers/page.tsx:19-33`). Danh sách cơ hội tải tối đa 1.000 bản ghi (đã trừ xóa mềm sau khi cắt, `server/opportunities.ts:60-61`),
   phân trang tại client (`OpportunityList.tsx:13,51-53`), xuất CSV bỏ qua cờ `truncated` (`:175`).
8. **Nhập khách hàng ghi thẳng Firestore từ trình duyệt** (`lib/customer-import.ts`); quyền xuất chỉ ẩn nút (`ImportExport.tsx:10`).
9. `safeCell` (`customer-io-core.ts:101`) chặn `= @` và `+/-` + ký tự không phải số, nhưng để lọt chuỗi như `-2+3` (đánh đổi để giữ số âm).
   Với cột văn bản của phân hệ mới nên áp dụng quy tắc chặt hơn.
10. Trùng lặp: mẫu counter+transaction ở 6 nơi; `SOURCES` ≈ `OPP_SOURCES`; `inp`/`Group`/`L`/`Footer` định nghĩa lặp ở nhiều component;
    `Modal` nằm trong `components/opportunities/ui.tsx` (phụ thuộc `opportunity-core`); `HistoryTimeline` gắn với kiểu cơ hội.
11. Không có test, không có `firestore.indexes.json`.

## 9. Lưu ý khi nâng cấp

- Không bỏ `requestId` / `version` ở thao tác ghi. Mọi truy vấn kèm `organizationId`.
- Kiểm thử rules bằng Firebase Emulator trước khi Publish; thay đổi rules có thể làm hỏng các trang dùng kiểu (A).
- `opportunity-core.ts` import `safeCell`, `toCsv` từ `customer-io-core.ts`: khi tách hàm dùng chung phải giữ re-export.
- Không commit `.env*`, khóa service account. Không gửi các file này cho AI.
- Với `cacheComponents`, trang đọc `searchParams` hoặc dữ liệu động cần bọc `Suspense` (kiểm tra khi build).

---

# PHỤ LỤC A — Module 10: Sản phẩm & Dịch vụ (đã chốt quyết định)

Nguồn: `MODULE SPECIFICATION 10` + các quyết định của chủ dự án.

| # | Quyết định |
|---|---|
| 1 | **Một collection chung** `catalogItems` cho sản phẩm và dịch vụ (`type: product \| service`). Nhóm tách theo `type`. |
| 2 | **Ma trận role cố định**, ghi rõ là **[GIẢ ĐỊNH]**, đặt trong `lib/catalog-core.ts` (xem A.2). |
| 3 | **Chỉ Admin** được đổi nhóm của khách hàng. Quy tắc nhiều nhóm: xem A.3 (đề xuất, chờ xác nhận). |
| 4 | **Chỉ VND**, số nguyên. Không có trường tiền tệ khác. |
| 5 | Thuế suất và chế độ giá đã/chưa gồm thuế **do chủ dự án cung cấp**; hệ thống không gieo sẵn mức thuế nào. Lưu trong `taxRates` quản trị được. |
| 6 | **Mã tự sinh** (counter) + kiểm tra duy nhất bằng tài liệu chỉ mục mã trong cùng transaction. |
| 7 | **Có quy trình phê duyệt thay đổi giá ngay từ đầu** (xem A.4). |

## A.1 Collection (toàn bộ server-only, rules `if false`)

Đã triển khai (01-A): `catalogItems` (subcollection `history` và `priceHistory`), `catalogCategories`, `catalogUnits`, `taxRates`
(mỗi loại có subcollection `history`), `priceChangeRequests`, `catalogCodes` (khóa duy nhất: `requestId` và ký hiệu đơn vị).
Về sau: `priceLists`, `priceListItems`, `groupPrices`, `discountPolicies`.
- `priceHistory` là SUBCOLLECTION của từng mặt hàng (đọc theo mặt hàng không cần chỉ mục). Màn "Lịch sử thay đổi giá" toàn hệ thống (Phase 04)
  sẽ dùng truy vấn collection group và cần cấu hình chỉ mục collection group trong `firestore.indexes.json`.
- ID tài liệu = `{organizationId}_{mã}` (vd `org1_SP00001`): mã duy nhất theo tổ chức và sắp theo mã khi phân trang.
- Counter: `{org}_product`, `{org}_service`, `{org}_cat_product`, `{org}_cat_service`, `{org}_unit`, `{org}_taxrate` (chỉ máy chủ ghi).
  Mã: SP#####, DV#####, NSP###, NDV###, DVT###, TX###.
- Mọi bản ghi: `organizationId`, `createdBy/At`, `updatedBy/At` (kèm tên), `deletedAt`, `version`.

## A.2 Ma trận quyền **[GIẢ ĐỊNH]**

| Chức năng | super_admin | director | manager | sales | operations / accountant / customer_service |
|---|---|---|---|---|---|
| Xem danh mục và giá mặc định | ✔ | ✔ | ✔ | ✔ | ✘ |
| Tạo / sửa / ngừng kinh doanh sản phẩm, dịch vụ | ✔ | ✔ | ✔ | ✘ | ✘ |
| Quản lý nhóm, đơn vị tính | ✔ | ✔ | ✔ | xem | ✘ |
| Quản lý thuế suất | ✔ | ✔ | ✘ | ✘ | ✘ |
| Đổi giá trực tiếp (không cần duyệt) | ✔ | ✔ | ✘ | ✘ | ✘ |
| Gửi yêu cầu đổi giá | — | — | ✔ | ✘ | ✘ |
| Duyệt / từ chối đổi giá | ✔ | ✔ | ✘ | ✘ | ✘ |
| Xuất dữ liệu | ✔ | ✔ | ✔ | ✘ | ✘ |

Dữ liệu danh mục dùng chung toàn công ty (không chia theo phòng ban). Mọi kiểm tra quyền thực hiện ở server.

## A.3 Nhóm khách hàng và giá (Phase 03)

- Chỉ `super_admin` được thêm / gỡ thành viên nhóm và tạo/sửa/ngừng nhóm khách hàng. Rules mới dùng `me().role == 'super_admin'`, không dùng claim.
- Đề xuất xử lý khách thuộc nhiều nhóm: mỗi nhóm có `pricePriority` do Admin đặt; hệ thống dùng nhóm có ưu tiên cao nhất có cấu hình giá cho mặt hàng đó.
- Không dùng `isVip` để xác định giá.
- Không cho ngừng/xóa nhóm đang được bảng giá hoặc chính sách chiết khấu tham chiếu.

## A.4 Phê duyệt đổi giá **[GIẢ ĐỊNH]**

- Giá ban đầu khi tạo mặt hàng không phải "thay đổi giá" (không cần duyệt) nhưng vẫn ghi `priceHistory`.
- Mọi thay đổi giá sau đó đi qua một hàm server duy nhất `changePrice()`: người có quyền đổi trực tiếp thì áp dụng ngay;
  người chỉ có quyền gửi yêu cầu thì tạo `priceChangeRequests` (`pending → approved | rejected`) kèm lý do bắt buộc.
- Khi duyệt: kiểm tra `version` của mặt hàng chưa đổi, ghi `priceHistory` (giá cũ/mới, người đề xuất, người duyệt, lý do) cùng transaction.
- Người duyệt không được tự duyệt yêu cầu của chính mình. `priceHistory` chỉ thêm, không sửa/xóa.

## A.5 Quy tắc dữ liệu

- Giá: số nguyên VND ≥ 0. Phần trăm (thuế, chiết khấu): số nguyên cơ sở 0,01% hoặc quy ước làm tròn thống nhất — **cần chốt khi làm Phase 03**.
- Mặt hàng đã phát sinh giao dịch: chỉ ngừng kinh doanh, không xóa. Báo giá/đơn hàng lưu bản chụp (mã, tên, mô tả, đơn vị, số lượng, đơn giá, chiết khấu, thuế, thành tiền).
- Hiện **chưa có phân hệ Báo giá/Đơn hàng**; Phase 04 chỉ xây hàm xác định giá và cấu trúc bản chụp, chưa nối được giao dịch thật.

## A.6 Lộ trình

| Bước | Nội dung |
|---|---|
| 00b ✔ | Sửa lỗi build `Charts.tsx`; gộp `globals-append.css`; `.gitignore`. (Xoay khóa service account: việc của chủ dự án) |
| 00c ✔ | Dọn 7 lỗi lint (còn 16 cảnh báo cũ) |
| 01-A ✔ | Backend danh mục: `catalog-core` + `server/catalog` + 12 route `/api/catalog/**` + rules + test (xem A.8) |
| 01-B | Giao diện: tách `Modal`/form/`HistoryTimeline` dùng chung; màn PS-01…PS-07 dưới `/products`; menu con |
| 01-C | Hộp thư duyệt giá; nhập/xuất qua server |
| 01-D | Chuyển quyền đổi nhóm khách hàng về `super_admin` (rules + `GroupChips`, trang nhóm) |
| 02 | Bảng giá, dòng giá, hiệu lực, lịch sử giá |
| 03 | Giá theo nhóm KH, chiết khấu, `resolvePrice()` + bộ kiểm thử |
| 04 | Lịch sử/so sánh giá đầy đủ, nền tảng liên kết báo giá/đơn hàng |

## A.7 Còn mở

Danh sách thuế suất (chủ dự án cung cấp; hệ thống không có mức mặc định) · "Admin" chỉ `super_admin` hay gồm cả `director` (đang giả định chỉ `super_admin`) ·
quyền xem của 3 role ngoài đặc tả (đang giả định không) · hạn mức giá trị khi duyệt (đang không có) · quy ước làm tròn khi tính chiết khấu/thuế (Phase 03) ·
hình ảnh và tài liệu đính kèm của mặt hàng (cần Firebase Storage, chưa làm) · lọc khoảng giá chưa dùng chỉ mục (lọc ở server).

## A.8 API `/api/catalog/**` (đã triển khai, 01-A)

Mọi API: `Authorization: Bearer <ID token>`; lỗi `{ error: { code, message } }`. Ghi dữ liệu mới cần `requestId` (16–64 ký tự `A-Za-z0-9-`); sửa cần `version`.

| Method | Đường dẫn | Chức năng / quyền |
|---|---|---|
| GET | `/items?type&status&categoryId&q&minPrice&maxPrice&limit&cursor` | Danh sách (phân trang con trỏ, sắp theo mã) — xem |
| POST | `/items` | Tạo; giá ban đầu không cần duyệt — sửa danh mục |
| GET / PATCH | `/items/[id]` | Chi tiết + lịch sử + lịch sử giá / Sửa (KHÔNG gồm giá, loại) |
| POST | `/items/[id]/price` | `{ newPrice, expectedPrice, reason }`: director/super_admin đổi ngay; manager tạo yêu cầu chờ duyệt |
| GET | `/price-requests?status=` | Yêu cầu đổi giá (manager chỉ thấy của mình) |
| POST | `/price-requests/[id]` | `{ decision: approve \| reject \| cancel, note }` — duyệt/từ chối: super_admin, director, không tự duyệt; hủy: người gửi |
| GET | `/stats` | Thẻ thống kê |
| GET, POST / PATCH, DELETE | `/categories[?type]` / `/categories/[id]` | Nhóm; xóa mềm khi không còn mặt hàng |
| GET, POST / PATCH, DELETE | `/units` / `/units/[id]` | Đơn vị; ký hiệu duy nhất; xóa mềm khi không còn mặt hàng |
| GET, POST / PATCH | `/tax-rates` / `/tax-rates/[id]` | Thuế suất (`ratePercent` hoặc `rateBp`) — super_admin, director |

Quy tắc đã cài đặt:
- Đổi giá luôn qua một hàm duy nhất (`changePrice`), đối chiếu `expectedPrice` (không dùng `version` để chỉnh sửa tên/mô tả không làm hỏng yêu cầu đang chờ).
  Mỗi mặt hàng chỉ có một yêu cầu chờ duyệt; đổi trực tiếp sẽ tự hủy yêu cầu đang chờ; duyệt khi giá hiện tại đã khác lúc gửi trả 409 `stale`.
- Tìm kiếm: mỗi tài liệu lưu mọi tiền tố (≤ 12 ký tự) của từng từ trong mã và tên (`searchTokens`); truy vấn dùng `array-contains` cho từ đầu,
  các từ còn lại và khoảng giá được lọc ở server (quét tối đa 8 × 100 tài liệu mỗi lần gọi; nếu chưa đủ trang sẽ trả `nextCursor` để tiếp tục).
  Không tìm được chuỗi nằm giữa từ (vd `bsite` trong `website`).
- Truy vấn danh sách chỉ dùng điều kiện bằng nhau + `array-contains` và sắp theo ID nên **không cần Composite Index** — **[CHƯA KIỂM CHỨNG trên Firestore thật]**.
  Nếu Firestore báo thiếu chỉ mục khi kết hợp `q` với `type`/`status`/`categoryId`, tạo chỉ mục theo đường dẫn trong thông báo lỗi.

Kiểm thử: `npm test` (24 test lõi nghiệp vụ + 28 test giao dịch server trên Firestore giả `lib/server/testing/fake-firestore.ts`).
Bản giả KHÔNG thay thế Emulator: không kiểm chứng rules, chỉ mục, giới hạn dung lượng/ghi của Firestore thật. Việc cần làm khi có Emulator: chạy lại các kịch bản đổi giá/duyệt giá.

### Giao diện Module 10 (01-B) — đã làm
- Trang: `/products` (PS-01 danh sách), `/products/new?type=product|service`, `/products/[id]` (PS-04: Tổng quan / Giá bán / Lịch sử giá / Lịch sử cập nhật; "Lịch sử kinh doanh" khóa chờ Phase 04),
  `/products/[id]/edit`, `/products/product-groups`, `/products/service-groups`, `/products/units`, `/products/tax-rates`. Menu con trong `components/dashboard/Shell.tsx`.
- Dùng chung mới: `components/ui/{Modal,form,HistoryTimeline}.tsx`; module cơ hội re-export lại để không đổi hành vi.
- Kiểm chứng: tsc sạch, eslint 0 lỗi, `next build` OK; chạy trình duyệt thật (Playwright) trên bản sao có đăng nhập giả + Firestore giả:
  tạo đơn vị/nhóm/thuế/sản phẩm/dịch vụ, chặn ký hiệu trùng, tìm không dấu, manager gửi yêu cầu → director duyệt → giá đổi, đổi giá trực tiếp, lịch sử giá,
  sales chỉ xem, operations bị từ chối, xung đột phiên bản báo lỗi, mobile 390px không cuộn ngang. **[CHƯA kiểm chứng với Firebase Auth/Firestore thật.]**
- Lưu ý: cảnh báo dev "could not validate instant navigation" xuất hiện ở mọi route (cả route cũ) do `cacheComponents`; không phải lỗi của module này.
- Chưa làm: ảnh/đính kèm (cần Firebase Storage), chọn nhiều + gán nhóm hàng loạt, hộp thư duyệt giá (01-C), nhập/xuất Excel (01-C).

### 01-C — hộp thư duyệt giá, nhập/xuất (đã làm)
- `/products/price-requests` (menu "Yêu cầu đổi giá"): tab Chờ duyệt / Đã duyệt / Từ chối / Đã hủy; người duyệt thấy tất cả, người gửi chỉ thấy của mình (do server lọc); Duyệt/Từ chối (không tự duyệt), Hủy (chỉ người gửi).
- Xuất: `GET /api/catalog/items/export` (kiểm tra quyền `export` ở server, theo bộ lọc hiện tại, tối đa 5.000 dòng, báo khi bị cắt); tệp .xlsx/.csv dựng ở trình duyệt từ dữ liệu server, có chống chèn công thức.
- Nhập: `POST /api/catalog/items/import` (≤ 50 dòng/lần, mỗi dòng đi qua `createItem`: quyền, mã tự sinh, lịch sử, giá ban đầu). Nhóm / đơn vị / thuế khớp theo TÊN với danh mục đã có (không tự tạo). Trùng tên + đơn vị trong tệp bị bỏ qua. Không kiểm tra trùng với dữ liệu đã có trong hệ thống.
  Nhập lại cùng tệp trong một lần mở hộp thoại không tạo bản sao (requestId theo dòng); mở hộp thoại mới rồi nhập lại tệp cũ SẼ tạo bản sao.
- Sửa lỗi lõi: `parsePrice` trước đây hiểu "1.5" / "1,5" thành 15. Nay chỉ nhận số thuần hoặc phân nhóm nghìn đúng 3 chữ số, còn lại bị từ chối.
- Kiểm thử: 62 test (thêm 10 cho nhập/xuất); chạy trình duyệt thật: nhập CSV (xem trước + nhập), xuất CSV, duyệt/hủy trong hộp thư, quyền sales. [Vẫn chưa kiểm chứng trên Firebase thật.]

### 01-D — chỉ Quản trị viên đổi nhóm của khách hàng (đã làm)
- `firestore.rules` (`customerGroupMembers`): tạo/sửa/xóa chỉ khi `me().role == 'super_admin'` (đọc từ `users/{uid}`, không dùng custom claim). Đọc vẫn theo tổ chức.
- Giao diện: `GroupChips.tsx` và `customers/groups/[id]/page.tsx` ẩn nút thêm/gỡ với vai trò khác và hiện ghi chú. Giao diện chỉ là lớp phụ; rules mới là chốt chặn.
- **[CHƯA kiểm chứng]** Chưa chạy được trên Emulator; cần publish rules rồi thử bằng tài khoản manager (phải bị từ chối) và super_admin (được).
- Tác động: manager/sales không còn thêm khách vào nhóm được nữa (thay đổi hành vi so với trước).

## Phase 02-A — Bảng giá (backend, đã làm)
Dữ liệu: `priceLists/{org}_{BG###}` (mã tự sinh, bộ đếm `{org}_pricelist`) + subcollection `items/{catalogItemId}` (1 giá / mặt hàng / bảng giá) và `history`. Khóa hoàn toàn khỏi trình duyệt trong `firestore.rules`.
Trường: tên, mô tả, loại (tiêu chuẩn / theo nhóm KH / đối tác / khuyến mại / khu vực / khác), phạm vi (ghi chú), ngày bắt đầu/kết thúc (`YYYY-MM-DD`, giờ VN), tiền tệ VND, `customerGroupIds` (kiểm tra tồn tại + cùng tổ chức), trạng thái, `itemCount`.
Trạng thái hiệu lực tính từ ngày hôm nay (`stateOf`): sắp áp dụng / đang áp dụng / hết hiệu lực / ngừng hoạt động. Hết hiệu lực KHÔNG chặn lưu; việc "không cho dùng bảng giá hết hạn" sẽ thực thi khi tích hợp báo giá (Phase 04).
API `/api/catalog/price-lists`: GET/POST; `[id]` GET/PATCH(version)/DELETE(version, xóa mềm, chỉ khi đã ngừng hoạt động); `[id]/status`; `[id]/duplicate` (kèm giá, bản sao ngừng hoạt động, ≤ 400 mặt hàng);
`[id]/items` GET (phân trang con trỏ) / POST (thêm + đặt giá hàng loạt ≤ 100 dòng, lỗi báo từng dòng, `expectedPrice` chống ghi đè) / DELETE; `[id]/history`; `[id]/export` (kiểm tra quyền xuất).
Quyền (GIẢ ĐỊNH, `price-list-core.ts`): xem = như danh mục (super_admin, director, manager, sales); sửa = super_admin, director; xuất = super_admin, director, manager.
**Lệch so với mặc định đã nêu:** manager chỉ xem bảng giá. Quy trình gửi yêu cầu/duyệt hiện có chỉ phục vụ giá mặc định; mở rộng cho giá trong bảng giá để Phase 04.
Chỉ mặt hàng đang kinh doanh mới thêm được vào bảng giá. Giá trong bảng giá độc lập với giá mặc định (đổi giá mặc định không làm đổi bảng giá).
Kiểm thử: 88 test (26 mới); 8 đột biến mã (bỏ kiểm tra giá lỗi thời, cho thêm hàng ngừng KD, cho xóa bảng giá đang hoạt động, quên tăng itemCount, bỏ kiểm tra tổ chức, bản sao đang hoạt động, sai biên ngày, mở quyền manager) đều bị test bắt.
**[CHƯA kiểm chứng trên Firestore thật]**: truy vấn `orderBy(documentId)` + `startAfter` trong subcollection, giới hạn 500 thao tác ghi/giao dịch (đã chặn ở 100 dòng và 400 mặt hàng khi nhân bản).

## Phase 02-B — Bảng giá (giao diện, đã làm)
Trang: `/products/price-lists` (danh sách: tìm tên/mã, lọc trạng thái hiệu lực, lọc "hiệu lực tại ngày", nhân bản / kích hoạt-ngừng / xóa, xuất Excel danh sách), `/new`, `/[id]` (tab Thông tin / Danh sách giá / Lịch sử), `/[id]/edit`. Menu con "Bảng giá".
Danh sách giá: lọc cục bộ, phân trang "Tải thêm", sửa giá tại chỗ (gửi `expectedPrice` chống ghi đè), chọn nhiều → điều chỉnh theo % (làm tròn 1/100/1.000 đ) hoặc xóa khỏi bảng giá, thêm mặt hàng (chế độ `mode:'add'`: không bao giờ ghi đè giá đang có), nhập giá từ Excel/CSV (cột Mã, Giá; thêm mới + cập nhật), xuất Excel/CSV (quyền kiểm ở server).
Lịch sử: dòng thời gian, lọc "Giá và mặt hàng".
Kiểm chứng: tsc sạch, eslint 0 lỗi, build OK, 92 test; chạy trình duyệt thật (Playwright) trên bản có đăng nhập giả + Firestore giả + `lib/groups` giả: tạo (kiểm tra ngày), chọn nhóm KH, thêm / thêm trùng, sửa giá, +10%, nhập CSV, lịch sử, xuất, xóa dòng, nhân bản, xóa, lọc, quyền manager/sales, mobile 390px. **[CHƯA kiểm chứng với Firebase thật; danh sách nhóm khách hàng trên form lấy qua Firestore phía trình duyệt (`lib/groups.listGroups`) — chưa thử thật.]**
Chưa làm: yêu cầu/duyệt giá cho manager (Phase 04), chặn dùng bảng giá hết hạn khi báo giá (Phase 04), quy tắc ưu tiên khi khách thuộc nhiều nhóm và `resolvePrice` (Phase 03).

## Phase 03-A – Giá theo nhóm khách hàng, ưu tiên nhóm, chiết khấu (backend)

**Collections mới** (đều chặn trình duyệt trong `firestore.rules`, chỉ truy cập qua API): `groupPrices/{itemId}__{groupId}` (+ `history`), `groupPriorities/{org}_{groupId}` (+ `history`), `discountPolicies` (mã `CK001…`, counter `{org}_discount`, + `history`).

**API** (`app/api/catalog/…`): `group-prices` (GET/POST lô), `group-prices/[id]` (PATCH), `group-prices/[id]/history`, `group-priorities` (GET/PUT), `price/resolve` (GET), `items/[id]/prices` (GET so sánh), `discounts` (GET/POST), `discounts/[id]` (GET/PATCH), `discounts/[id]/status`, `discounts/[id]/history`, `discounts/evaluate` (POST).

**Quy tắc xác định giá (`resolvePriceCore`)** – GIẢ ĐỊNH đã được xác nhận bằng "ok":
1. Giá theo nhóm đang hiệu lực của các nhóm khách hàng. Khách thuộc nhiều nhóm: `priority` cao hơn (do super_admin đặt, 0–1000) thắng; hòa → giá thấp hơn; hòa → groupId nhỏ hơn.
2. Bảng giá đang hiệu lực (active + trong ngày): bảng gắn nhóm của khách xét trước, rồi bảng chung (không gắn nhóm). Trong một cấp: giá thấp nhất thắng, hòa → theo mã.
3. Giá mặc định của mặt hàng (cảnh báo nếu 0). Mặt hàng ngừng KD hoặc không có giá → `found:false`, không bao giờ tự bịa giá.

**Chiết khấu**: loại % (điểm cơ bản) hoặc số tiền (VND); phạm vi nhóm khách / mặt hàng / nhóm hàng (rỗng = tất cả); đơn tối thiểu; ngày; trạng thái. Chọn 1 chính sách không cộng dồn có mức giảm lớn nhất (hòa → mã nhỏ) + toàn bộ chính sách cộng dồn đủ điều kiện; phân bổ theo tỷ lệ cho các dòng khớp, phần dư vào dòng cuối, mỗi dòng không vượt thành tiền dòng.

**Hạn mức chiết khấu theo vai trò (GIẢ ĐỊNH, cần xác nhận)**: super_admin 100%, director 100%, manager 20%, sales 5%, vai trò khác 0%; vượt hạn mức → `needsApproval: true` (luồng phê duyệt thực tế ở Phase 04).

**Quyền (GIẢ ĐỊNH)**: xem = super_admin, director, manager, sales; sửa giá nhóm / bảng giá / chiết khấu = super_admin, director; đặt ưu tiên nhóm = chỉ super_admin.

**Kiểm thử**: 134 test pass (FakeDb); kiểm tra đột biến 5/5 bị bắt (đảo thứ tự ưu tiên, giá cao nhất trong cấp, chọn chiết khấu nhỏ nhất, bỏ kiểm tra quyền ưu tiên, bỏ kiểm tra quyền sửa). `tsc`, `eslint`, `next build` sạch. CHƯA kiểm chứng trên Firestore thật: rules, index (truy vấn `orderBy(documentId)` + `startAfter` kèm lọc bằng), giới hạn ghi.

## Phase 03-B – Giao diện giá theo nhóm, ưu tiên nhóm, chiết khấu, tính thử

**Trang mới** (menu "Sản phẩm & Dịch vụ"): `/products/group-prices` (lọc nhóm/trạng thái/mặt hàng, thêm theo lô, sửa, điều chỉnh % hàng loạt, lịch sử, "Tải thêm" theo con trỏ), `/products/group-priorities` (chỉ super_admin sửa; vai trò khác chỉ xem), `/products/discounts` (+ `new`, `[id]`, `[id]/edit`), `/products/price-check` (tính thử giá + chiết khấu, không lưu), và mục "Giá theo bảng giá và nhóm khách hàng" trong tab Giá bán của chi tiết mặt hàng (`components/pricing/ItemPrices.tsx`).

**Thành phần**: `components/pricing/{shared,GroupPrices,GroupPriorities,Discounts,DiscountForm,DiscountDetail,PriceCheck,ItemPrices}.tsx`. Danh sách nhóm khách hàng lấy qua `/api/catalog/group-priorities` (không đọc Firestore từ trình duyệt). `ItemPicker` dùng chung cho thêm giá nhóm, phạm vi chiết khấu và tính thử.

**Hành vi cần biết**: thêm giá nhóm dùng chế độ "chỉ thêm" (không ghi đè); điều chỉnh % dùng chế độ "đặt giá" và gửi theo từng nhóm; chiết khấu % nhập theo % (tối đa 2 số lẻ) và lưu thành điểm cơ bản; nút sửa / thêm chỉ hiện khi API trả `can.edit`.

**Kiểm chứng**: `tsc`, `eslint`, `next build` sạch; 134 test đạt; kịch bản Playwright 30 bước trên backend giả (director / super_admin / sales / operations, màn hình 1360 và 390 px) đều đạt, gồm thêm trùng không ghi đè, -10% hàng loạt, ưu tiên > 1000 bị chặn, tạo/sửa/ngừng chính sách, tính thử với hạn mức 5% của sales, tab so sánh giá. CHƯA kiểm chứng với Firebase thật (đăng nhập thật, rules, index).

**Còn lại (Phase 04)**: lịch sử giá tổng hợp + xuất file, luồng yêu cầu đổi giá bảng giá / giá nhóm cho manager, chặn dùng bảng giá hết hạn, tích hợp báo giá và lưu snapshot giá.

## Phase 04-A – Thuế, ảnh chụp giá, lịch sử giá tổng hợp, yêu cầu đổi giá (backend)

**Phát hiện quan trọng**: dự án CHƯA có phân hệ Báo giá / Đơn hàng (menu `/quotes` chưa có trang, không có collection). Theo mục X của đặc tả (không tự bổ sung nghiệp vụ ngoài Module 10), Module 10 chỉ cung cấp **điểm tích hợp** để phân hệ Báo giá/Đơn hàng sau này dùng; việc "không thay đổi báo giá cũ khi đổi giá" do chứng từ tự giữ **ảnh chụp giá** này, không tra lại giá sống.

**Tính thuế** (`lineTax`, `sumTotals` trong `lib/pricing-core.ts`): thuế tính trên số tiền SAU chiết khấu của từng dòng; giá "đã gồm thuế" → tách thuế (`a·r/(1+r)`), "chưa gồm" → cộng thuế (`a·r`); làm tròn nửa lên, tính bằng BigInt; mỗi dòng tối đa 99.999.999.999.999 ₫ (quá mức → dòng báo lỗi) để tổng 50 dòng vẫn là số nguyên an toàn. `POST /api/catalog/discounts/evaluate` nay trả thêm cho từng dòng: đơn vị, thuế suất (tên, bp), `priceIncludesTax`, `amountBeforeTax`, `tax`, `total`; và `totals {subtotal, discount, amountBeforeTax, tax, total}`.

**Ảnh chụp giá** `POST /api/catalog/pricing/snapshot` (cùng đầu vào như evaluate): chỉ thành công khi MỌI dòng đã có giá (ngược lại 422 `unpriced`); trả `PriceSnapshot` (schema 1, thời điểm, ngày áp giá, nhóm KH, người tính, các dòng, chính sách đã áp dụng, tổng, cờ cần phê duyệt) + `fingerprint` SHA-256 của nội dung để phát hiện sửa đổi. Không ghi dữ liệu. Phân hệ báo giá nên lưu nguyên đối tượng này vào chứng từ.

**Lịch sử giá tổng hợp**: collection `priceLog` (chặn trình duyệt trong rules), ghi trong CÙNG giao dịch với mọi thay đổi giá: giá mặc định (ban đầu / trực tiếp / duyệt), bảng giá (thêm / đổi), giá nhóm (thêm / đổi / sửa qua PATCH). Khóa tài liệu = mili-giây (đệm 0) + hậu tố ngẫu nhiên → phân trang theo `documentId` giảm dần, KHÔNG cần chỉ mục tổng hợp; lọc (nguồn, hình thức, mặt hàng, phạm vi, từ khóa, từ/đến ngày theo giờ VN) quét theo lô tối đa 2.000 bản ghi mỗi lần gọi, `nextCursor` cho biết còn dữ liệu chưa quét. `GET /api/catalog/price-history`, `/price-history/export` (≤ 5.000 dòng, `truncated`). Xem: super_admin/director/manager/sales; xuất: trừ sales. **Không có dữ liệu cho các thay đổi giá xảy ra trước khi triển khai** (không backfill).

**Yêu cầu đổi giá bảng giá / giá nhóm** (collection `priceChangeRequests`): chỉ `manager` gửi (director/super_admin sửa trực tiếp), bắt buộc có lý do, một yêu cầu đang chờ cho mỗi (loại, bảng giá/nhóm, mặt hàng), có thể là thêm giá mới (`oldPrice = null`). Director/super_admin duyệt hoặc từ chối (không tự duyệt yêu cầu của mình), người gửi được hủy. Duyệt: kiểm tra giá hiện tại còn đúng `oldPrice` (khác → 409 `stale`), giữ chỗ pending→approved trong một giao dịch, rồi áp dụng bằng đúng luồng đặt giá thường (`savePrices` / `saveGroupPrices`) với nhật ký ghi người đề xuất = người thực hiện, người duyệt riêng; áp dụng lỗi → hoàn về pending. Giới hạn đã biết: bước giữ chỗ và bước áp dụng là hai giao dịch (không nguyên tử); nếu tiến trình chết giữa hai bước, yêu cầu có thể ở `approved` mà giá chưa đổi → cần xử lý tay. API: `GET/POST /api/catalog/price-change-requests`, `POST /api/catalog/price-change-requests/[id]` (`decision: approve|reject|cancel`).

**Về "chặn dùng bảng giá hết hạn"**: `resolvePrice` / `evaluate` / snapshot vốn đã bỏ qua bảng giá hết hạn, chưa đến hạn, ngừng hoạt động (có test); không bổ sung chặn chỉnh sửa giá trong bảng giá hết hạn vì đặc tả không yêu cầu.

**Kiểm thử**: 161 test đạt; 9 đột biến (thuế gồm/chưa gồm, thuế trước chiết khấu, trần dòng, kiểm tra stale, hoàn tác, ngày UTC thay vì VN, bỏ nhật ký giá nhóm / giá trực tiếp, dấu vân tay) đều bị bắt. `FakeDb.startAfter` đã sửa để tôn trọng chiều sắp xếp giảm dần. CHƯA kiểm chứng trên Firestore thật (truy vấn `orderBy(documentId desc)` + `startAfter` kèm lọc bằng; `tx.get(query)` nhiều điều kiện bằng).

## Phase 04-B – Giao diện lịch sử giá, yêu cầu đổi giá bảng giá/nhóm, tính thử có thuế

**Trang / thành phần mới**: `/products/price-history` (`components/pricing/PriceHistory.tsx`: lọc nguồn giá / hình thức / từ khóa / khoảng ngày, so sánh giá cũ – mới kèm chênh lệch và %, người thực hiện, người duyệt, lý do, "Tải thêm" theo con trỏ, xuất Excel ≤ 5.000 dòng; nút xuất chỉ hiện khi API cho phép); `/products/price-requests` nay có 2 tab: "Giá bán mặc định" (Phase 01) và "Bảng giá & giá theo nhóm" (`ChangeRequests.tsx`: duyệt / từ chối kèm ghi chú / hủy); nút "Xin đổi giá" (`RequestChange.tsx`) hiện cho vai trò `manager` ở danh sách giá nhóm và danh sách giá của bảng giá; công cụ Tính thử giá có thêm cột Thuế, Phải trả và tổng chưa thuế / thuế / tổng phải trả.

**Kiểm chứng**: 161 test đạt; `tsc`, `next build` sạch; kịch bản Playwright 21 bước trên backend giả (director, manager, sales; 1360 và 390 px) đều đạt, gồm lọc / tìm / khoảng ngày sai / xuất Excel, sales không có nút xuất, manager gửi yêu cầu (thiếu lý do bị chặn, gửi trùng bị chặn), director duyệt (giá được áp dụng, nhật ký ghi manager là người thực hiện và director là người duyệt) và từ chối kèm ghi chú, tính thử có thuế gồm / chưa gồm. CHƯA kiểm chứng với Firebase thật.

**Còn lại / ngoài phạm vi Module 10**: phân hệ Báo giá & Đơn hàng chưa tồn tại — khi xây, dùng `POST /api/catalog/pricing/snapshot` và lưu nguyên ảnh chụp vào chứng từ. Chưa làm: ảnh / tệp đính kèm sản phẩm (cần Firebase Storage), gán nhóm hàng hàng loạt, danh sách thuế suất thật (do người dùng cung cấp).
