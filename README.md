# OCFR

منظومة وثائق عربية + أمن سيبراني.

```
OCFR/
├── backend/     # FastAPI
├── frontend/    # Next.js
├── deploy/      # nginx + entrypoint (Docker)
├── Dockerfile   # صورة واحدة: واجهة + API
└── docker-compose.yml
```

## التشغيل بـ Docker (موصى به للسيرفر)

صورة واحدة تجمع الواجهة والخلفية. المتصفح يتحدث مع نفس النطاق عبر `/api` — **لا حاجة لـ `NEXT_PUBLIC_API_URL`**.

```bash
cd OCFR
docker compose up -d --build
```

| العنوان | الغرض |
|---------|--------|
| `http://localhost` أو `https://your-domain` | الواجهة |
| `http://localhost/api/...` | كل واجهات الـ API |
| `http://localhost/api/docs` | توثيق FastAPI |
| `http://localhost/api/health` | فحص الصحة |

البيانات تُحفظ في volume اسمه `ocfr-data` (SQLite، رفع، Chroma).

اختياري في `.env` بجانب `docker-compose.yml`:

```
JWT_SECRET=strong-random-secret
VT_API_KEY=your-virustotal-key
```

## التطوير المحلي (بدون Docker)

الواجهة تستخدم المسار النسبي `/api`؛ Next يعيد توجيهه إلى المنفذ 8000 تلقائياً.

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

افتح: http://localhost:3000 — الطلبات تذهب إلى `/api/*` ثم تُوجَّه إلى `http://127.0.0.1:8000`.

## حسابات تجريبية

| المستخدم | كلمة المرور | الصلاحية |
|----------|-------------|----------|
| `admin`  | `admin123`  | مدير |
| `editor` | `editor123` | محرر |
| `member` | `member123` | عضو |

## كيف يعمل نفس النطاق

```
المتصفح  →  https://domain/          →  Next.js
          →  https://domain/api/...  →  FastAPI  (nginx يحذف بادئة /api)
```

الواجهة تستدعي دائماً مسارات مثل `/api/tasks` و`/api/auth/login` نسبةً إلى أصل الصفحة الحالي.
