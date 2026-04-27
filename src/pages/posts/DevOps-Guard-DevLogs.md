---
layout: ../../layouts/MarkdownPostLayout.astro
title: 'DevOps Guard - DevLogs'
pubDate: 2025-09-20
description: 'Revisiting .NET and C#'
author: 'Yash Patel'
image:
    url: '/postphotos/post 8 - devops/devops.png'
    alt: 'Screenshot of the DevOps Guard dashboard'
tags: ["Computer Science"]
showHero: false

song:
  title: "LOVE TO PARTY"
  artist: "Avii"
---

### Intro
DevOpsGuard is envisioned as a web API service that tracks work items (tickets), compute simple operational KPIs (backlog health, SLA breach rate, risk), ingest ops events (e.g. Build failed), and show everything in a lightweight dashboard.

I realized that my .NET and C# skills were developed during the second year of my degree, but haven't really been used all that much since. Over the past four days, I took it upon myself to carefully build an application from the ground up and log everything. This will help me revisit this part of my skillset, rebuild it, and come out with a new project under my belt.

<u><a href="https://github.com/DarkishLocket10/devops-guard" target="_blank">Check it out on GitHub</a></u>

<figure>
  <a>
    <img src="/postphotos/post 8 - devops/devops.png" alt="Screenshot of the DevOps Guard dashboard" />
  </a>
  <figcaption>Screenshot of the DevOps Guard dashboard</figcaption>
</figure>


### Goals
I had several constraints/goals I set out for this project:
- Modern Minimal API in .NET 8
- EF Core with SQL Server; code-first migrations
- Validation with consistent error handling
- OpenAPI with summaries and examples
- Background Job (daily) to snapshot metrics
- CSV export for history
- Docker Compose for API; GHCR image publishing
- A single-file dashboard (no Node) served from wwwroot/

---
### Environment & Tooling
- Windows 10/11
- .NET SDK 8.0.20 (`dotnet --info`)
- Docker Desktop4.0 (`docker --version`)
- VS Code with C# Dev Kit + REST Client
- SQL Server (containerized via Compose)

Sanity Checks
- `docker run hello-world` (success)
- `dotnet new`(works)
- Browser opens `https://localhost<port>/swagger`

These are some super simple validations to make sure everything is working before I kicked things off.

---
### Project scaffolding (top level)
I created a multi-project solution consisting of domain, infra, API. Here's what the root surface looks like:

```
src/
  DevOpsGuard.Domain/        // entities, enums
  DevOpsGuard.Infrastructure/ // EF Core DbContext, configurations, repositories, migrations
  DevOpsGuard.Api/            // minimal API, endpoints, filters, wwwroot dashboard
```

Key design decisions:
- Minimal APIs for crisp endpoint definitions + typed results.
- Domain first: entity & enum definitions live under Domain.
- Infra holds EF Core + repository; API wires DI and endpoints.

---
### Domain Model
Everything is centered on `WorkItem` and a `MetricsSnapshot`

Here's a simplified Entities block:
``` csharp
// Work item + lifecycle
public enum Priority { Low, Medium, High, P0 }
public enum WorkItemStatus { Open, InProgress, Blocked, Resolved }

public sealed class WorkItem {
  public Guid Id { get; }
  public string Title { get; private set; }
  public string Service { get; private set; }
  public Priority Priority { get; private set; }
  public DateOnly? DueDate { get; private set; }
  public WorkItemStatus Status { get; private set; } = WorkItemStatus.Open;
  public string? Component { get; private set; }
  public string? Assignee { get; private set; }
  public List<string> Labels { get; } = new();

  public DateTime CreatedAtUtc { get; private set; }
  public DateTime UpdatedAtUtc { get; private set; }
  // domain methods: Rename, ChangePriority, SetStatus, etc.
}

public sealed class MetricsSnapshot {
  public Guid Id { get; init; }
  public DateTime CapturedAtUtc { get; init; }
  public double BacklogHealthPct { get; init; }
  public double SlaBreachRatePct { get; init; }
  public int OverdueCount { get; init; }
  public double RiskAvg { get; init; }
}
```

I've also defined DTOs for create/update/list/response shapes.

---
### Infrastructure: EF Core & configuration

#### Db Context + mapping

- SQL Server provider
- `DateOnly` mapped via `ValueConverter`
- `List<string> Labels` flattened as comma-separated string with a `ValueConverter` + `ValueComparer` (to get EF change tracking right)

On my way, I ran into a few compiler/EF expression tree issues:
- Using a statement-body lambda inside `ValueComparer` hash calculation causes "*A lambda expression with a statement body cannot be converted to an expression tree*"

Fix: switch to expression-bodied lambdas:
```csharp
v => v == null ? 0 : v.Aggregate(0, (h, s) => HashCode.Combine(h, s?.GetHashCode() ?? 0))
```

- Using `is` pattern or local function in comparer "*An expression tree may not contain....*".
Fix: stick to simple null-coalesced sequences and `SequenceEqual`.

- Null warnings when comparing lists
Fix: normalize with `a ?? Empty`, `b ?? Empty` before `Sequence Equal`.

#### Migrations & schema

- First run returned **“Invalid object name 'WorkItems'”** when POSTing → classic sign the database/table wasn’t created.  
    **Root cause:** migrations not applied.  
    **Fix path:**
    
    1. Add EF Design package to **startup** (API) project (tools error demanded it).
        
    2. `dotnet ef migrations add Initial --project src/DevOpsGuard.Infrastructure -s src/DevOpsGuard.Api`
        
    3. `dotnet ef database update -s src/DevOpsGuard.Api -p src/DevOpsGuard.Infrastructure`
        
    4. On startup, `db.Database.Migrate()` when `UseSqlServer=true`.
        
- Later I added indexes (updated list sorting) with another migration; when EF said **“name is used by an existing migration”**, I picked a new unique name.

---
### API: minimal endpoints & typed results

I implemented endpoints with **typed results** (`Results<Created<WorkItemResponse>, BadRequest<string>>`) and **FluentValidation** filters.

Endpoints:

- `POST /workitems`
    
- `GET /workitems/{id}`
    
- `GET /workitems` (filters + paging + sorting)
    
- `PATCH /workitems/{id}`
    
- `DELETE /workitems/{id}`
    
- `POST /dev/seed` (dev seeding)
    
- `POST /events/ingest` (apply event rules)
    
- `GET /metrics` (live)
    
- `GET /metrics/history` & `/metrics/history.csv` (snapshots)
    
- `POST /dev/metrics/snapshot` (dev capture)
    


#### Gotchas I fixed

- ❌ **Anonymous type vs `Ok<object>`**  
    Returning `TypedResults.Ok(new { ... })` from a delegate typed as `Task<Ok<object>>` fails implicit conversion. 
    
    **Fix:** make the delegate return `IResult` or a matching anonymous result type, e.g. `Task<Results<Ok<dynamic>, ProblemHttpResult>>` or switch the `Ok` to `Ok<object>(...)`. I standardized to **`IResult`** for ad-hoc shapes.
    
- ❌ **Enum parsing in POST**  
    When Swagger sent `"priority": "High"` but our model attempted numeric enum, System.Text.Json threw conversion errors.  
    
    **Fix:** enable `JsonStringEnumConverter` so I accept `"High"`/`"P0"` etc.
    
- **OpenAPI polish**  
	I added `.WithOpenApi(op => { op.Summary = ...; op.RequestBody.Content["application/json"].Example = ...; })` to document examples.  
	
    Got **“WithOpenApi does not exist”** → missing `using Microsoft.AspNetCore.OpenApi;` and ensuring Swashbuckle is added. After adding the using, it compiled and examples rendered.
    
--- 
### Validation & consistent errors  

- **FluentValidation** validators for create/update DTOs.
    
- A small **endpoint filter** (`ValidationFilter<T>`) that runs validators and returns a **ProblemDetails** 400 with messages.
    
- I kept a couple of **quick guard clauses** for must-have fields (`Title`, `Service`) in the handler too.

---
### Metrics

**KPIs:**

- Backlog Health % = % of open items touched in last 7 days
    
- SLA Breach % = % of open items overdue
    
- Risk Avg = base(priority) + 3 × daysOverdue, clamped to 0..100
    

I initially referenced `WorkItemStatus.Done`, then **renamed the status to `Resolved`** (more dev-friendly) and fixed queries accordingly.

**History:**  
`MetricsSnapshot` stored daily.

- `/metrics` calculates live (“now”) from `WorkItems`.
    
- `/metrics/history` reads `MetricsSnapshots`.
    
- `/metrics/history.csv` streams CSV (protected by API key).
    
- **Background service** runs daily at `Metrics__SnapshotHourLocal` to persist one snapshot per day.
    

**Chart empty?**  
The dashboard plot relies on snapshots, not the live endpoint. If you see an empty chart: call `POST /dev/metrics/snapshot` (or use the dashboard’s “Capture Snapshot” button) a couple times after making changes to items.



---

### Events ingest

`POST /events/ingest` applies simple rule-based updates to a `WorkItem`:

- `build_failed` → add `build-failed`, `InProgress`, raise to ≥ High
    
- `incident_opened` → add `incident`, `Blocked`, set to `P0`
    
- `deploy_succeeded` → add `deploy-ok`
    
- `coverage_dropped` → add `qa`, raise to ≥ Medium
    

I verified the flow by ingesting events and observing changes in `GET /workitems/{id}` and `/metrics`.

---
### Dashboard (static; no Node)

I served a single HTML page from `wwwroot/dashboard/index.html`.  
Two common pitfalls I hit and fixed:

- **404 for /dashboard** → I hadn’t enabled `app.UseStaticFiles()`.  This was a rookie mistake.
    **Fixes:**
    - add `app.UseStaticFiles();`
        
    - add `app.MapGet("/dashboard", () => Results.Redirect("/dashboard/index.html"));`
        
    - ensure dashboard file is under `DevOpsGuard.Api/wwwroot/dashboard/index.html` and **rebuild** the Docker image.
        

**Features:**

- API key input (`X-API-Key` header for protected endpoints)
    
- Load KPIs + chart (`/metrics`, `/metrics/history?days=`)
    
- **CSV download** button (fetch blob from `/metrics/history.csv`)
    
- **Work items list** with filters + sorting + paging (client-side)
    
- **Delete** action
    
- **Create** work item form
    
- **Edit** modal (PATCH selected fields)
    
- Quick actions: **Mark Resolved**, **Bump → P0**
    
- Optional **auto-refresh** every 60s
    

Everything is vanilla JS / Fetch API; no frameworks.

---

---

### Docker Compose & environment

`docker/docker-compose.yml` orchestrates:

- `sqlserver`: `mcr.microsoft.com/mssql/server:2022-latest`
    
    - `ACCEPT_EULA=Y`, `SA_PASSWORD=${SA_PASSWORD}`
        
    - Healthcheck using `sqlcmd`
        
    - Volume for data persistence
        
- `api`: builds `src/DevOpsGuard.Api/Dockerfile`
    
    - `UseSqlServer=true`
        
    - `ConnectionStrings__Default=Server=sqlserver,1433;...`
        
    - `ApiKey=${API_KEY}`
        
    - `ASPNETCORE_URLS=http://0.0.0.0:8080`
        
    - Metrics auto-capture envs
        
    - Port `8080:8080`
        

**The big Compose pitfall:**

Warnings showed:

> “The `SA_PASSWORD` variable is not set. Defaulting to a blank string.”

Root cause: variable **substitution happens before** `env_file` is applied, and Compose looks for `.env` **in the compose file’s directory**. I had `.env` in repo root while compose lived in `/docker`.

**Fixes (either works):**

- Pass `--env-file .\.env` when running compose from repo root, **or**
    
- Move `.env` to `docker/.env` (I did this).
    

I also hit **SQL login failed for ‘sa’** and **container unhealthy** when the SA password didn’t apply or when the data volume had an old password.  
**Fix:** `docker compose -f docker/docker-compose.yml down -v` to drop volume, then `up -d` with correct env loaded.

**Verification:**

- `docker ps` shows `devopsguard-sql` **healthy**
    
- `docker logs devopsguard-sql` shows “SQL Server is now ready…”
    
- Swagger at `http://localhost:8080/swagger` works; `/dev/seed` creates items.
    

---

### API security

- Simple **API key** header: `X-API-Key`
    
- Applied to write operations (POST/PATCH/DELETE, dev endpoints, CSV).
    
- Dashboard sends the key from the input box with every request that needs it.
    

(For production, use OAuth/OIDC; API key here is for demo simplicity.)

---

### GHCR container publishing & repo hygiene

I enabled **GitHub Container Registry** publishing in CI and hit:

- ❌ **invalid tag**: `repository name must be lowercase`  
    **Fix:** ensure `ghcr.io/<owner>/<repo>/devopsguard-api:...` is **all lowercase**.
    

Security hygiene:

- **Never commit real secrets**.
    
- Use `docker/.env` (git-ignored).
    
- If a secret ever leaks, **rotate** it and purge history if needed.
    
- Enable GitHub **secret scanning/push protection**.
    

---

### Testing & developer ergonomics

- I kept **in-memory repository** support for integration tests (flip `UseSqlServer=false`), then use `WebApplicationFactory<Program>` in a test project.
    
- For local dev without Docker, use `dotnet user-secrets` for `ApiKey` and connection string to a local SQL instance.
    

---

### Common errors I encountered (and how I recognized them)

- **500s on POST/GET after wiring EF** → check logs: `Invalid object name 'WorkItems'` ⇒ migrations not applied.
    
- **Enum JSON conversion errors** on POST → accept strings via `JsonStringEnumConverter`.
    
- **Anonymous type typed result mismatch** → change handler return type to `IResult` or align generic `Ok<T>` type.
    
- **Expression trees** complaining about `is` / statement-body lambdas in `ValueComparer` → use expression bodies and pure expressions only.
    
- **Swagger / WithOpenApi** missing → add `using Microsoft.AspNetCore.OpenApi;`.
    
- **/dashboard 404** → add `UseStaticFiles()`, correct file path, rebuild image.
    
- **SQL unhealthy** + env warnings → move `.env` next to compose or provide `--env-file`, then `down -v` and `up -d`.
    

Each time I hit an error, I:

1. Read the exact exception (top lines matter)
    
2. Mapped to the layer (routing, model binding, EF, DB, Docker)
    
3. Applied the minimal fix, rebuilt, re-tested
    

---

### Architecture & data diagrams

### High-level flow (Mermaid)

[[Click here to view the chart on mermaid.js]](https://mermaidchart.com/play?utm_source=mermaid_live_editor&utm_medium=share#pako:eNp1UNtOwkAQ_ZXJPGnSEgqFrhtjws1IJPHSYIzUh7Vd2gbabbZbBYF_d3uBYIz7sDuzc-bMObNDXwQcKS7X4suPmFQwe_ZSLwWYT8E094NCRRRezcHj1Lzn271p3oCOS4h-_kPMpzVHfddAmNzCSEgOJWA8XFy4TzNwufzk8vK9BubFRyhZFsGQ-atQiiIN6gKA--kv7kSueFD1xD6nMGbxegtuyrI8Eqrh4Meecuq1nvVH4Emd5mzE_NI5cl9gssmE3sW5l6b6kPHGeVlCA0MZB0iVLLiBCZcJK1PcVfZRRTzhHlIdBkyuPPTSg-7JWPomRHJs007DCOmSrXOdFVnAFB_HTO8iOf1KbYzLkd6JQtqxKg6kO9wgJZ1W125fEct2-g7pdR0Dt0gdu2URx-5bDrF0rU8OBn5XQ9st4vTaZ8c6_ABmdZx6)

<pre class="mermaid">
flowchart LR

  UI --|Auth: X-API-Key|--> API

API --|Auth: X-API-Key|--> UI

  

  API -- EF Core --> DB[(SQL Server)]

  subgraph Background

    Svc[Hosted Service: Daily Snapshot]

  end

  API <-->|Auth: X-API-Key| UI

  Svc --> DB

  API -- CSV Export --> UI

  API -- OpenAPI --> UI
</pre>

### ERD
[[Click here to view the diagram on mermaid.js]](https://mermaidchart.com/play?utm_source=mermaid_live_editor&utm_medium=share#pako:eNp9UstuwjAQ_BVrzwiR8kiaG4RDUVsVQVGlKhc3XhKLxI7sTVSK-Pc6KS3Ch552dsY7s1r5BJkWCDGgWUqeG16lirE3bQ4rwoqduo4xS0aq3IGVYOtHj3uVVKLHbdG0MvPZtZHaSDr-0IITdpUtG1w67FsQp8Z6ZKKrWitU5PFza2Wu0Pd44h9Y2sS210SSFbLEoINiTjvKPGlXixvpnKquPKPzzOxW8doWmv47zDWF19SYm5h9qTl1YMGzQ6nzB-QlFeuMPHlb8oXbMSs2zuxPlqoXGXtp0YgGE90of3Ij7WHe5pfVYQC5kQJiMg0OoEJT8a6Ffv8UqMAKU4gdFNwcUkjV2c3UXL1rXf2OGd3kBcR7XlrXNf2FLr_l7wkqgaZfCOJp7wDxCT4hju6G48noPgom4SyMpuNwAEeIw8kwiMLJLAijwGmz6DyArz5yNIzC6fkbtBbTJQ)


<pre class="mermaid">
erDiagram
  WorkItem {
    string   Id PK
    string   Title
    string   Service
    string   Priority
    date     DueDate
    string   Status
    string   Component
    string   Assignee
    string   LabelsCsv
    datetime CreatedAtUtc
    datetime UpdatedAtUtc
  }

  MetricsSnapshot {
    string   Id PK
    datetime CapturedAtUtc
    float    BacklogHealthPct
    float    SlaBreachRatePct
    int      OverdueCount
    float    RiskAvg
  }
</pre>




---
### What each metric means

#### Backlog Health %

**Interpretation:** Team momentum on open work.

- **High (80–100%)**: most open items saw activity in the last week-good cadence.
    
- **Mid (40–80%)**: some items may be stagnating-investigate older items.
    
- **Low (<40%)**: backlog is stale-risk of hidden debt, re-prioritize or prune.
    

**How to improve:** make small updates, triage regularly, reassign or close stale items.

#### SLA Breach %

**Interpretation:** Timeliness adherence for open work.

- **Low (0–10%)**: most items on time-healthy.
    
- **Mid (10–30%)**: growing schedule pressure-review due dates and load.
    
- **High (>30%)**: frequent misses-adjust SLAs, unblock dependencies, add capacity.
    

**How to improve:** renegotiate due dates, clear blockers, escalate critical items.

#### Overdue Count

**Interpretation:** Absolute number of late items.  
Use alongside SLA Breach %-a small team might have a low % but a non-trivial count; large teams the inverse.

**How to improve:** same as SLA Breach-reduce bottlenecks and recalibrate dates.

#### Risk (Average)

**Interpretation:** Aggregate operational risk from **priority** and **lateness**.

- A **High-priority** item past due quickly pushes risk toward 100.
    
- Items with **no due date** still contribute via their **base priority**.
    

Rule of thumb:

- **0–20**: calm waters
    
- **20–50**: watchlist-some high/late work exists
    
- **50–75**: elevated-multiple late High/P0 items
    
- **75–100**: red zone-urgent remediation needed
    

**How to improve:** resolve P0/High first, set and honor realistic due dates, break down large scope.



---
### Demo run through

1. `docker compose -f docker/docker-compose.yml up -d` (with `docker/.env` present)
    
2. Browse `http://localhost:8080/swagger` → **Authorize** with your API key
    
3. `POST /dev/seed` → creates demo items
    
4. `GET /workitems` → see items; use filters & sorting
    
5. `POST /events/ingest` → e.g., `build_failed` on an item
    
6. `GET /metrics` → observe KPI changes
    
7. `POST /dev/metrics/snapshot` → capture point(s)
    
8. Dashboard `http://localhost:8080/dashboard` → paste API key, **Load**
    
9. Try **Download CSV**, **Edit**, **Delete**, **Mark Resolved**, **Bump → P0**
    
10. Toggle **auto-refresh**; try presets

---
### What I accomplished here

- Clean **.NET 8** minimal APIs, typed results, JSON enum strings, OpenAPI examples
    
- EF Core with real **converters/comparers** and **migrations**
    
- Concrete **KPIs** and a transparent risk function
    
- **Background processing** that interacts with the DB correctly
    
- A useful **static dashboard** (no infra tax) that demonstrates end-to-end UX
    
- **Docker Compose** + **healthchecks** and **secrets discipline**
    
- **GHCR** publishing and small but real CI/CD concerns


