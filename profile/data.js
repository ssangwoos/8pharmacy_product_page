/* ══════════════════════════════════════════════════════════════════════
   EIGHT PHARMACY — 공통 데이터 (공개 페이지 · 관리자 페이지가 함께 사용)

   · LANGS        지원 언어 목록
   · UI           화면 고정 문구 번역
   · DEFAULT_DATA 지점 기본값 — Firestore 연결이 안 될 때 쓰이는 폴백입니다.
                  평소 수정은 admin.html(관리자 페이지)에서 하세요.
   ══════════════════════════════════════════════════════════════════════ */

const LANGS = [
  { code: "ko", short: "KR", label: "한국어",           flag: "../images/flag-kr.png" },
  { code: "en", short: "EN", label: "English",          flag: "../images/flag-en.png" },
  { code: "ja", short: "JP", label: "日本語",            flag: "../images/flag-jp.png" },
  { code: "zh", short: "CN", label: "简体中文",          flag: "../images/flag-cn.png" },
  { code: "tw", short: "TW", label: "繁體中文",          flag: "../images/flag-tw.png" },
  { code: "th", short: "TH", label: "ไทย",              flag: "../images/flag-th.png" },
  { code: "vi", short: "VN", label: "Tiếng Việt",       flag: "../images/flag-vn.png" },
  { code: "id", short: "ID", label: "Indonesia", flag: "../images/flag-id.png" },
  { code: "mn", short: "MN", label: "Монгол",           flag: "../images/flag-mn.png" }
];

const LANG_CODES = LANGS.map(l => l.code);

/* ── 언어 기본값 ──────────────────────────────────────────────────────
   DEFAULT_LANG      처음 들어온 손님에게 보여줄 언어 ("en", "ko", "ja" …)
   AUTO_DETECT_LANG  true 로 바꾸면 방문자의 브라우저 언어를 감지해
                     자동으로 맞춰줍니다 (일본 브라우저 → 日本語 등).
                     false 면 항상 DEFAULT_LANG 으로 시작합니다.
   ※ 손님이 한 번 언어를 고르면 그 브라우저에는 선택이 기억됩니다.
   ──────────────────────────────────────────────────────────────────── */
const DEFAULT_LANG = "en";
const AUTO_DETECT_LANG = false;

/* REMEMBER_LANG  손님이 고른 언어를 그 브라우저에 기억할지 여부.
   true  = 다음에 다시 와도 지난번 고른 언어로 열림 (권장)
   false = 올 때마다 항상 DEFAULT_LANG 으로 시작 */
const REMEMBER_LANG = true;

/* 브라우저 언어 → 지원 언어 매핑 */
const LANG_MATCH = [
  [/^ko/i, "ko"], [/^ja/i, "ja"],
  [/^zh[-_](tw|hk|mo)/i, "tw"], [/^zh[-_]hant/i, "tw"], [/^zh/i, "zh"],
  [/^th/i, "th"], [/^vi/i, "vi"], [/^(id|in)/i, "id"], [/^mn/i, "mn"], [/^en/i, "en"]
];

/* ── 화면 고정 문구 ──────────────────────────────────────────────────── */
const UI = {
  ko: {
    heroBadge: "K-BEAUTY &amp; DERMATOLOGY",
    heroTitle: "약사가 고른<br>한국 스킨케어",
    heroDesc: "약사가 직접 고르고, 직접 설명해 드리는 더마 스킨케어.",
    badgeTax: "택스프리샵", badgeConsult: "전문 피부 상담",
    filterRegionLabel: "지역", filterStatusLabel: "영업",
    optAllRegion: "전체 지역", optAllStatus: "전체", optOpenNow: "지금 영업중",
    channelsTitle: "공식 채널", branchTitle: "지점 안내",
    countUnit: "개 지점", emptyNote: "조건에 맞는 지점이 없습니다.",
    taxNotice: "전 지점 택스프리샵 (Tax Free Shop)",
    btnNaver: "네이버", btnKakao: "카카오", btnGoogle: "구글맵", btnAmap: "고덕지도",
    nightOpen: "심야 영업", call: "전화", follow: "팔로우", langLabel: "언어",
    stOpen: "영업중", stSoon: "곧 마감", stShut: "영업 종료", stOff: "오늘 휴무", stOpensAt: "오픈",
    dWeekday: "평일", dSat: "토", dSun: "일"
  },
  en: {
    heroBadge: "K-BEAUTY &amp; DERMATOLOGY",
    heroTitle: "Pharmacist-curated<br>Korean skincare",
    heroDesc: "Dermacare picked and explained by licensed pharmacists.",
    badgeTax: "Tax Free Shop", badgeConsult: "Skin Consultation",
    filterRegionLabel: "Region", filterStatusLabel: "Status",
    optAllRegion: "All regions", optAllStatus: "All", optOpenNow: "Open now",
    channelsTitle: "Official Channels", branchTitle: "Our Stores",
    countUnit: "stores", emptyNote: "No store matches this filter.",
    taxNotice: "All of our stores are Tax Free Shops.",
    btnNaver: "Naver", btnKakao: "Kakao", btnGoogle: "Google", btnAmap: "Amap",
    nightOpen: "Open late", call: "Call", follow: "Follow", langLabel: "Language",
    stOpen: "Open", stSoon: "Closing soon", stShut: "Closed", stOff: "Closed today", stOpensAt: "opens",
    dWeekday: "Mon–Fri", dSat: "Sat", dSun: "Sun"
  },
  ja: {
    heroBadge: "K-BEAUTY &amp; DERMATOLOGY",
    heroTitle: "薬剤師が選ぶ<br>韓国スキンケア",
    heroDesc: "薬剤師が厳選し、直接ご説明する処方スキンケア。",
    badgeTax: "免税店", badgeConsult: "肌悩みカウンセリング",
    filterRegionLabel: "エリア", filterStatusLabel: "営業",
    optAllRegion: "すべてのエリア", optAllStatus: "すべて", optOpenNow: "営業中のみ",
    channelsTitle: "公式SNS", branchTitle: "店舗一覧",
    countUnit: "店舗", emptyNote: "条件に合う店舗がありません。",
    taxNotice: "全店舗 免税店(Tax Free Shop)です。",
    btnNaver: "Naver", btnKakao: "Kakao", btnGoogle: "Google", btnAmap: "高德地図",
    nightOpen: "深夜営業", call: "電話", follow: "フォロー", langLabel: "言語",
    stOpen: "営業中", stSoon: "まもなく閉店", stShut: "営業終了", stOff: "本日休業", stOpensAt: "開店",
    dWeekday: "平日", dSat: "土", dSun: "日"
  },
  zh: {
    heroBadge: "K-BEAUTY &amp; DERMATOLOGY",
    heroTitle: "药剂师精选的<br>韩国护肤",
    heroDesc: "药剂师亲自挑选并讲解的药妆护肤。",
    badgeTax: "免税店", badgeConsult: "专业护肤咨询",
    filterRegionLabel: "区域", filterStatusLabel: "营业",
    optAllRegion: "全部区域", optAllStatus: "全部", optOpenNow: "正在营业",
    channelsTitle: "官方社交媒体", branchTitle: "门店一览",
    countUnit: "家门店", emptyNote: "没有符合条件的门店。",
    taxNotice: "全部门店均为免税店(Tax Free Shop)。",
    btnNaver: "Naver地图", btnKakao: "Kakao地图", btnGoogle: "谷歌地图", btnAmap: "高德地图",
    nightOpen: "夜间营业", call: "电话", follow: "关注", langLabel: "语言",
    stOpen: "营业中", stSoon: "即将打烊", stShut: "已打烊", stOff: "今日休息", stOpensAt: "开门",
    dWeekday: "平日", dSat: "周六", dSun: "周日"
  },
  tw: {
    heroBadge: "K-BEAUTY &amp; DERMATOLOGY",
    heroTitle: "藥師精選的<br>韓國保養",
    heroDesc: "藥師親自挑選並解說的藥妝保養。",
    badgeTax: "免稅店", badgeConsult: "專業肌膚諮詢",
    filterRegionLabel: "區域", filterStatusLabel: "營業",
    optAllRegion: "全部區域", optAllStatus: "全部", optOpenNow: "營業中",
    channelsTitle: "官方社群", branchTitle: "門市一覽",
    countUnit: "家門市", emptyNote: "沒有符合條件的門市。",
    taxNotice: "全部門市皆為免稅店(Tax Free Shop)。",
    btnNaver: "Naver地圖", btnKakao: "Kakao地圖", btnGoogle: "Google地圖", btnAmap: "高德地圖",
    nightOpen: "深夜營業", call: "電話", follow: "追蹤", langLabel: "語言",
    stOpen: "營業中", stSoon: "即將打烊", stShut: "已打烊", stOff: "今日公休", stOpensAt: "開門",
    dWeekday: "平日", dSat: "週六", dSun: "週日"
  },
  th: {
    heroBadge: "K-BEAUTY &amp; DERMATOLOGY",
    heroTitle: "สกินแคร์เกาหลี<br>คัดสรรโดยเภสัชกร",
    heroDesc: "เวชสำอางที่เภสัชกรคัดสรรและแนะนำด้วยตนเอง",
    badgeTax: "ร้านปลอดภาษี", badgeConsult: "ปรึกษาปัญหาผิว",
    filterRegionLabel: "พื้นที่", filterStatusLabel: "สถานะ",
    optAllRegion: "ทุกพื้นที่", optAllStatus: "ทั้งหมด", optOpenNow: "เปิดอยู่ตอนนี้",
    channelsTitle: "ช่องทางทางการ", branchTitle: "สาขาของเรา",
    countUnit: "สาขา", emptyNote: "ไม่พบสาขาที่ตรงเงื่อนไข",
    taxNotice: "ทุกสาขาเป็นร้านปลอดภาษี (Tax Free Shop)",
    btnNaver: "Naver", btnKakao: "Kakao", btnGoogle: "Google", btnAmap: "Amap",
    nightOpen: "เปิดถึงดึก", call: "โทร", follow: "ติดตาม", langLabel: "ภาษา",
    stOpen: "เปิด", stSoon: "ใกล้ปิด", stShut: "ปิดแล้ว", stOff: "วันนี้ปิด", stOpensAt: "เปิด",
    dWeekday: "จ.–ศ.", dSat: "ส.", dSun: "อา."
  },
  vi: {
    heroBadge: "K-BEAUTY &amp; DERMATOLOGY",
    heroTitle: "Dược sĩ tuyển chọn<br>mỹ phẩm Hàn Quốc",
    heroDesc: "Mỹ phẩm dược do dược sĩ tuyển chọn và tư vấn trực tiếp.",
    badgeTax: "Cửa hàng miễn thuế", badgeConsult: "Tư vấn da chuyên sâu",
    filterRegionLabel: "Khu vực", filterStatusLabel: "Trạng thái",
    optAllRegion: "Tất cả khu vực", optAllStatus: "Tất cả", optOpenNow: "Đang mở cửa",
    channelsTitle: "Kênh chính thức", branchTitle: "Cửa hàng",
    countUnit: "cửa hàng", emptyNote: "Không có cửa hàng phù hợp.",
    taxNotice: "Tất cả cửa hàng của chúng tôi đều là Tax Free Shop.",
    btnNaver: "Naver", btnKakao: "Kakao", btnGoogle: "Google", btnAmap: "Amap",
    nightOpen: "Mở khuya", call: "Gọi", follow: "Theo dõi", langLabel: "Ngôn ngữ",
    stOpen: "Đang mở", stSoon: "Sắp đóng", stShut: "Đã đóng", stOff: "Hôm nay nghỉ", stOpensAt: "mở",
    dWeekday: "T2–T6", dSat: "T7", dSun: "CN"
  },
  id: {
    heroBadge: "K-BEAUTY &amp; DERMATOLOGY",
    heroTitle: "Skincare Korea<br>pilihan apoteker",
    heroDesc: "Perawatan kulit yang dipilih dan dijelaskan langsung oleh apoteker.",
    badgeTax: "Toko Bebas Pajak", badgeConsult: "Konsultasi Kulit",
    filterRegionLabel: "Wilayah", filterStatusLabel: "Status",
    optAllRegion: "Semua wilayah", optAllStatus: "Semua", optOpenNow: "Sedang buka",
    channelsTitle: "Kanal Resmi", branchTitle: "Toko Kami",
    countUnit: "toko", emptyNote: "Tidak ada toko yang cocok.",
    taxNotice: "Semua toko kami adalah Tax Free Shop.",
    btnNaver: "Naver", btnKakao: "Kakao", btnGoogle: "Google", btnAmap: "Amap",
    nightOpen: "Buka malam", call: "Telepon", follow: "Ikuti", langLabel: "Bahasa",
    stOpen: "Buka", stSoon: "Segera tutup", stShut: "Tutup", stOff: "Tutup hari ini", stOpensAt: "buka",
    dWeekday: "Sen–Jum", dSat: "Sab", dSun: "Min"
  },
  mn: {
    heroBadge: "K-BEAUTY &amp; DERMATOLOGY",
    heroTitle: "Эм зүйчийн сонгосон<br>Солонгос арьс арчилгаа",
    heroDesc: "Эм зүйч өөрөө сонгож, тайлбарлаж өгдөг арьс арчилгааны бүтээгдэхүүн.",
    badgeTax: "Татваргүй дэлгүүр", badgeConsult: "Арьсны зөвлөгөө",
    filterRegionLabel: "Бүс нутаг", filterStatusLabel: "Төлөв",
    optAllRegion: "Бүх бүс", optAllStatus: "Бүгд", optOpenNow: "Одоо нээлттэй",
    channelsTitle: "Албан ёсны сувгууд", branchTitle: "Дэлгүүрүүд",
    countUnit: "дэлгүүр", emptyNote: "Тохирох дэлгүүр алга.",
    taxNotice: "Бидний бүх дэлгүүр Tax Free Shop юм.",
    btnNaver: "Naver", btnKakao: "Kakao", btnGoogle: "Google", btnAmap: "Amap",
    nightOpen: "Шөнө ажиллана", call: "Залгах", follow: "Дагах", langLabel: "Хэл",
    stOpen: "Нээлттэй", stSoon: "Удахгүй хаана", stShut: "Хаалттай", stOff: "Өнөөдөр амарна", stOpensAt: "нээнэ",
    dWeekday: "Да–Ба", dSat: "Бя", dSun: "Ня"
  }
};

/* ── 지점 기본값 (Firestore 폴백) ────────────────────────────────────── */
const DEFAULT_DATA = {
  channels: {
    handle:    "@eight_pharmacy",
    instagram: "https://instagram.com/eight_pharmacy",
    tiktok:    "https://tiktok.com/@eight_pharmacy"
  },

  regions: [
    { id: "seoul", label: {
        ko:"서울", en:"Seoul", ja:"ソウル", zh:"首尔", tw:"首爾",
        th:"โซล", vi:"Seoul", id:"Seoul", mn:"Сөүл" } },
    { id: "jeju", label: {
        ko:"제주", en:"Jeju", ja:"済州", zh:"济州岛", tw:"濟州島",
        th:"เชจู", vi:"Jeju", id:"Jeju", mn:"Жэжү" } }
  ],

  branches: [
    {
      id: "gangnam",
      region: "seoul",
      cityTag: "SEOUL · GANGNAM",
      photo: "",
      phone: "",
      nightOpen: false,
      hours: { weekday: "09:00-22:30", sat: "09:00-22:30", sun: "09:00-22:30" },
      maps: {
        naver:  "https://naver.me/exampleGangnam",
        kakao:  "https://kko.to/exampleGangnam",
        google: "https://maps.google.com/?q=Gangnam+Eight+Pharmacy",
        amap:   ""
      },
      social: { instagram: "", tiktok: "" },
      text: {
        ko: { name:"강남 본점", sub:"뷰티 메인 스트리트", address:"서울 강남구 강남대로 390 1층",
              desc:"강남역 메인 뷰티거리 · 전문 더마 처방 큐레이션" },
        en: { name:"Gangnam Flagship", sub:"Beauty Main Street", address:"1F, 390 Gangnam-daero, Gangnam-gu, Seoul",
              desc:"On Gangnam's main beauty street · Curated dermacare" },
        ja: { name:"江南(カンナム) 本店", sub:"ビューティーストリート", address:"ソウル特別市 江南区 江南大路 390 1F",
              desc:"江南駅メインストリート · 韓国コスメ&処方スキンケア" },
        zh: { name:"江南总店", sub:"美妆核心商圈", address:"首尔特别市江南区江南大路390 1层",
              desc:"江南站美妆主街 · 韩国药妆护肤专研" },
        tw: { name:"江南總店", sub:"美妝核心商圈", address:"首爾特別市江南區江南大路390 1樓",
              desc:"江南站美妝主街 · 韓國藥妝保養專研" },
        th: { name:"สาขาคังนัม (สาขาหลัก)", sub:"ถนนสายบิวตี้", address:"1F, 390 Gangnam-daero, Gangnam-gu, Seoul",
              desc:"ถนนบิวตี้หลักหน้าสถานีคังนัม · เวชสำอางคัดสรรโดยเภสัชกร" },
        vi: { name:"Gangnam (Cửa hàng chính)", sub:"Phố làm đẹp", address:"1F, 390 Gangnam-daero, Gangnam-gu, Seoul",
              desc:"Phố mỹ phẩm chính ga Gangnam · Mỹ phẩm dược tuyển chọn" },
        id: { name:"Gangnam (Pusat)", sub:"Jalan Kecantikan", address:"1F, 390 Gangnam-daero, Gangnam-gu, Seoul",
              desc:"Jalan kecantikan utama Stasiun Gangnam · Dermacare pilihan" },
        mn: { name:"Каннам (Төв салбар)", sub:"Гоо сайхны гудамж", address:"1F, 390 Gangnam-daero, Gangnam-gu, Seoul",
              desc:"Каннам буудлын гоо сайхны гол гудамж · Сонгосон гоо сайхны бүтээгдэхүүн" }
      }
    },
    {
      id: "md1",
      region: "seoul",
      cityTag: "SEOUL · MYEONGDONG",
      photo: "",
      phone: "",
      nightOpen: true,
      hours: { weekday: "09:00-23:00", sat: "09:00-23:00", sun: "09:00-23:00" },
      maps: {
        naver:  "https://naver.me/exampleMyeongdong1",
        kakao:  "https://kko.to/exampleMyeongdong1",
        google: "https://maps.google.com/?q=Myeongdong+Eight+Pharmacy+1",
        amap:   ""
      },
      social: { instagram: "", tiktok: "" },
      text: {
        ko: { name:"명동 1호점", sub:"글로벌 쇼핑 중심지", address:"서울 중구 명동8길 27 1층",
              desc:"명동역 도보 1분 · 외국인 여행자를 위한 택스프리 데스크 운영" },
        en: { name:"Myeongdong 1st", sub:"Global Shopping District", address:"1F, 27 Myeongdong 8-gil, Jung-gu, Seoul",
              desc:"1 min from Myeongdong Stn · Tax free desk for travellers" },
        ja: { name:"明洞(ミョンドン) 1号店", sub:"ショッピングの中心", address:"ソウル特別市 中区 明洞8キル 27 1F",
              desc:"明洞駅徒歩1分 · 旅行者向け免税カウンター完備" },
        zh: { name:"明洞 1号店", sub:"全球购物中心", address:"首尔特别市中区明洞8街27 1层",
              desc:"明洞站步行1分钟 · 设有旅客免税柜台" },
        tw: { name:"明洞 1號店", sub:"全球購物中心", address:"首爾特別市中區明洞8街27 1樓",
              desc:"明洞站步行1分鐘 · 設有旅客免稅櫃台" },
        th: { name:"เมียงดง สาขา 1", sub:"ย่านช้อปปิ้งระดับโลก", address:"1F, 27 Myeongdong 8-gil, Jung-gu, Seoul",
              desc:"เดิน 1 นาทีจากสถานีเมียงดง · มีเคาน์เตอร์ปลอดภาษีสำหรับนักท่องเที่ยว" },
        vi: { name:"Myeongdong 1", sub:"Khu mua sắm quốc tế", address:"1F, 27 Myeongdong 8-gil, Jung-gu, Seoul",
              desc:"1 phút đi bộ từ ga Myeongdong · Có quầy miễn thuế cho du khách" },
        id: { name:"Myeongdong 1", sub:"Distrik Belanja Global", address:"1F, 27 Myeongdong 8-gil, Jung-gu, Seoul",
              desc:"1 menit dari Stasiun Myeongdong · Ada meja bebas pajak untuk turis" },
        mn: { name:"Мёндон 1-р салбар", sub:"Дэлхийн худалдааны төв", address:"1F, 27 Myeongdong 8-gil, Jung-gu, Seoul",
              desc:"Мёндон буудлаас 1 минутын зайд · Жуулчдад зориулсан татваргүй цэгтэй" }
      }
    },
    {
      id: "md2",
      region: "seoul",
      cityTag: "SEOUL · MYEONGDONG",
      photo: "",
      phone: "",
      nightOpen: true,
      hours: { weekday: "10:00-23:30", sat: "10:00-23:30", sun: "10:00-23:30" },
      maps: {
        naver:  "https://naver.me/exampleMyeongdong2",
        kakao:  "https://kko.to/exampleMyeongdong2",
        google: "https://maps.google.com/?q=Myeongdong+Eight+Pharmacy+2",
        amap:   ""
      },
      social: { instagram: "", tiktok: "" },
      text: {
        ko: { name:"명동 2호점", sub:"NYUNYU 맞은편", address:"서울 중구 명동4길 15 1층",
              desc:"뉴뉴(NYUNYU) 매장 정면 · 심야 웰니스 및 스킨케어 상담" },
        en: { name:"Myeongdong 2nd", sub:"Opposite NYUNYU", address:"1F, 15 Myeongdong 4-gil, Jung-gu, Seoul",
              desc:"Directly opposite NYUNYU · Late-night skincare consultation" },
        ja: { name:"明洞(ミョンドン) 2号店", sub:"NYUNYUの正面", address:"ソウル特別市 中区 明洞4キル 15 1F",
              desc:"NYUNYU(ニューニュー)正面 · 深夜スキンケア相談対応" },
        zh: { name:"明洞 2号店", sub:"NYUNYU 对面", address:"首尔特别市中区明洞4街15 1层",
              desc:"NYUNYU正对面 · 夜间健康/美肤咨询" },
        tw: { name:"明洞 2號店", sub:"NYUNYU 對面", address:"首爾特別市中區明洞4街15 1樓",
              desc:"NYUNYU正對面 · 深夜保養諮詢" },
        th: { name:"เมียงดง สาขา 2", sub:"ตรงข้าม NYUNYU", address:"1F, 15 Myeongdong 4-gil, Jung-gu, Seoul",
              desc:"ตรงข้ามร้าน NYUNYU · ปรึกษาผิวรอบดึก" },
        vi: { name:"Myeongdong 2", sub:"Đối diện NYUNYU", address:"1F, 15 Myeongdong 4-gil, Jung-gu, Seoul",
              desc:"Đối diện NYUNYU · Tư vấn da đến khuya" },
        id: { name:"Myeongdong 2", sub:"Seberang NYUNYU", address:"1F, 15 Myeongdong 4-gil, Jung-gu, Seoul",
              desc:"Tepat di seberang NYUNYU · Konsultasi kulit malam hari" },
        mn: { name:"Мёндон 2-р салбар", sub:"NYUNYU-ийн эсрэг талд", address:"1F, 15 Myeongdong 4-gil, Jung-gu, Seoul",
              desc:"NYUNYU-ийн яг эсрэг талд · Шөнө орой арьсны зөвлөгөө" }
      }
    },
    {
      id: "jeju",
      region: "jeju",
      cityTag: "JEJU ISLAND",
      photo: "",
      phone: "",
      nightOpen: false,
      hours: { weekday: "09:00-22:00", sat: "09:00-22:00", sun: "09:00-22:00" },
      maps: {
        naver:  "https://naver.me/exampleJeju",
        kakao:  "https://kko.to/exampleJeju",
        google: "https://maps.google.com/?q=Jeju+Eight+Pharmacy",
        amap:   ""
      },
      social: { instagram: "", tiktok: "" },
      text: {
        ko: { name:"제주점", sub:"노연로 웰니스 스팟", address:"제주 제주시 노연로 80 1층",
              desc:"제주 여행 맞춤형 선케어 & 이너뷰티 웰니스 솔루션" },
        en: { name:"Jeju Island", sub:"Noyeon-ro Wellness", address:"1F, 80 Noyeon-ro, Jeju-si, Jeju",
              desc:"Suncare & inner-beauty essentials for your Jeju trip" },
        ja: { name:"済州(チェジュ) 店", sub:"済州ウェルネス", address:"済州特別自治道 済州市 老蓮路 80 1F",
              desc:"済州旅行おすすめ薬局 · サンケア&ビタミン補給" },
        zh: { name:"济州分店", sub:"老莲路养生据点", address:"济州特别自治道济州市老莲路80 1层",
              desc:"济州旅行必备 · 防晒修护与健康养护" },
        tw: { name:"濟州分店", sub:"老蓮路養生據點", address:"濟州特別自治道濟州市老蓮路80 1樓",
              desc:"濟州旅行必備 · 防曬修護與健康調理" },
        th: { name:"สาขาเชจู", sub:"เวลเนสถนนโนยอน", address:"1F, 80 Noyeon-ro, Jeju-si, Jeju",
              desc:"ครีมกันแดดและวิตามินสำหรับทริปเชจู" },
        vi: { name:"Đảo Jeju", sub:"Wellness Noyeon-ro", address:"1F, 80 Noyeon-ro, Jeju-si, Jeju",
              desc:"Chống nắng & vitamin làm đẹp cho chuyến đi Jeju" },
        id: { name:"Pulau Jeju", sub:"Wellness Noyeon-ro", address:"1F, 80 Noyeon-ro, Jeju-si, Jeju",
              desc:"Suncare & inner beauty untuk perjalanan Jeju Anda" },
        mn: { name:"Жэжү арал", sub:"Ноён-ро эрүүл мэнд", address:"1F, 80 Noyeon-ro, Jeju-si, Jeju",
              desc:"Жэжү аялалд тохирсон нарны тос ба гоо сайхны витамин" }
      }
    }
  ]
};

/* 새 지점을 만들 때 쓰는 빈 틀 (관리자 페이지에서 사용) */
function blankBranch(){
  const text = {};
  LANG_CODES.forEach(c => { text[c] = { name:"", sub:"", address:"", desc:"" }; });
  return {
    id: "branch" + Date.now().toString(36),
    region: (DEFAULT_DATA.regions[0] || {}).id || "seoul",
    cityTag: "",
    photo: "",
    phone: "",
    nightOpen: false,
    hours: { weekday: "09:00-22:00", sat: "09:00-22:00", sun: "09:00-22:00" },
    maps: { naver:"", kakao:"", google:"", amap:"" },
    social: { instagram:"", tiktok:"" },
    text
  };
}

function blankRegion(){
  const label = {};
  LANG_CODES.forEach(c => { label[c] = ""; });
  return { id: "region" + Date.now().toString(36), label };
}
