export interface Integration { id: string; name: string; description: string; categories: string[] }
// Catalog descriptions supplied by the workspace owner. Listing is not connector availability.
export const integrationCatalog: Integration[] = [
  {
    "id": "outlook",
    "name": "Outlook",
    "description": "Microsoft email, calendar and contacts",
    "categories": [
      "Microsoft"
    ]
  },
  {
    "id": "asana",
    "name": "Asana",
    "description": "Work management for planning and tracking team projects",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "monday",
    "name": "Monday",
    "description": "Work management boards for projects and workflows",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "google-calendar",
    "name": "Google Calendar",
    "description": "Events, availability and scheduling in Google Calendar",
    "categories": [
      "Google"
    ]
  },
  {
    "id": "tiktok",
    "name": "TikTok",
    "description": "Publish videos and photo posts to TikTok",
    "categories": [
      "Social media"
    ]
  },
  {
    "id": "instagram",
    "name": "Instagram",
    "description": "Publish photos, carousels, and Reels — requires a Business or Creator account linked to a Facebook Page",
    "categories": [
      "Social media"
    ]
  },
  {
    "id": "linkedin",
    "name": "LinkedIn",
    "description": "Publish posts to your personal profile and the company pages you manage",
    "categories": [
      "Social media"
    ]
  },
  {
    "id": "reddit",
    "name": "Reddit",
    "description": "Communities, posts and comments on Reddit",
    "categories": [
      "Social media"
    ]
  },
  {
    "id": "meta-ads",
    "name": "Meta Ads",
    "description": "Read ad accounts, campaigns, and insights from Meta Ads",
    "categories": [
      "Social media"
    ]
  },
  {
    "id": "google-ads",
    "name": "Google Ads",
    "description": "Search, display and video advertising on Google",
    "categories": [
      "Google"
    ]
  },
  {
    "id": "gmail",
    "name": "Gmail",
    "description": "Read, search and send email from a Gmail or Google Workspace mailbox",
    "categories": [
      "Google"
    ]
  },
  {
    "id": "x-twitter",
    "name": "X (Twitter)",
    "description": "Publish posts and threads to X (Twitter)",
    "categories": [
      "Social media"
    ]
  },
  {
    "id": "google-docs",
    "name": "Google Docs",
    "description": "Documents in Google Docs with real-time collaboration",
    "categories": [
      "Google"
    ]
  },
  {
    "id": "google-drive",
    "name": "Google Drive",
    "description": "Cloud file storage and sharing in Google Drive",
    "categories": [
      "Google"
    ]
  },
  {
    "id": "google-sheets",
    "name": "Google Sheets",
    "description": "Spreadsheets in Google Sheets with real-time collaboration",
    "categories": [
      "Google"
    ]
  },
  {
    "id": "ticktick",
    "name": "TickTick",
    "description": "To-do lists and task scheduling across devices",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "facebook",
    "name": "Facebook",
    "description": "Publish posts and photos to the Facebook Pages you manage",
    "categories": [
      "Social media"
    ]
  },
  {
    "id": "slackbot",
    "name": "Slackbot",
    "description": "Read access to your Slack workspace: search messages, files and channels",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "whatsapp",
    "name": "Whatsapp",
    "description": "Message customers through the WhatsApp Business API (business accounts only)",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "excel",
    "name": "Excel",
    "description": "Microsoft spreadsheets with formulas, tables and charts",
    "categories": [
      "Microsoft"
    ]
  },
  {
    "id": "webflow",
    "name": "Webflow",
    "description": "No-code website builder with a built-in CMS and hosting",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "attio",
    "name": "Attio",
    "description": "Customizable CRM for managing relationships and deals",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "sentry",
    "name": "Sentry",
    "description": "Error tracking and performance monitoring for apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "linear",
    "name": "Linear",
    "description": "Issue tracking and project planning for product teams",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "google-search-console",
    "name": "Google Search Console",
    "description": "How your site performs and gets indexed in Google Search",
    "categories": [
      "Google"
    ]
  },
  {
    "id": "google-analytics",
    "name": "Google Analytics",
    "description": "Website traffic, user behavior and conversion reports",
    "categories": [
      "Google"
    ]
  },
  {
    "id": "mailchimp",
    "name": "Mailchimp",
    "description": "Email marketing campaigns, audiences and automations",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "zoom",
    "name": "Zoom",
    "description": "Video meetings, webinars and recordings",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "sharepoint",
    "name": "SharePoint",
    "description": "Microsoft sites and document libraries for teams",
    "categories": [
      "Microsoft"
    ]
  },
  {
    "id": "google-bigquery",
    "name": "Google BigQuery",
    "description": "Google Cloud data warehouse for SQL analytics at scale",
    "categories": [
      "Google"
    ]
  },
  {
    "id": "clickup",
    "name": "ClickUp",
    "description": "Tasks, docs and goals for teams in one workspace",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "calendly",
    "name": "Calendly",
    "description": "Appointment scheduling with booking links and reminders",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "onedrive",
    "name": "OneDrive",
    "description": "Microsoft cloud storage for files and sharing",
    "categories": [
      "Microsoft"
    ]
  },
  {
    "id": "google-maps",
    "name": "Google Maps",
    "description": "Places, geocoding and directions from Google Maps",
    "categories": [
      "Google"
    ]
  },
  {
    "id": "microsoft-teams",
    "name": "Microsoft Teams",
    "description": "Chat, meetings and channels in Microsoft 365",
    "categories": [
      "Microsoft"
    ]
  },
  {
    "id": "cal",
    "name": "Cal",
    "description": "Open-source scheduling with shareable booking pages",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "youtube",
    "name": "YouTube",
    "description": "Video hosting with channels, playlists and analytics",
    "categories": [
      "Google",
      "Social media"
    ]
  },
  {
    "id": "salesforce",
    "name": "Salesforce",
    "description": "CRM for sales, service and marketing teams",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "hubspot",
    "name": "Hubspot",
    "description": "CRM for marketing, sales and customer service",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "stripe-read-only",
    "name": "Stripe (read-only)",
    "description": "Online payments, subscriptions and invoicing",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "notion",
    "name": "Notion",
    "description": "Docs, wikis and databases in one workspace",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "github",
    "name": "GitHub",
    "description": "Manage repositories, issues, pull requests, and code reviews",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "dynamics-365",
    "name": "Dynamics 365",
    "description": "Connect to Business Central for financials, inventory, and operations",
    "categories": [
      "Microsoft",
      "CRM"
    ]
  },
  {
    "id": "google-workspace",
    "name": "Google Workspace",
    "description": "Access Gmail, Google Calendar, Drive, Docs, Sheets, and Slides",
    "categories": [
      "Google"
    ]
  },
  {
    "id": "google-business-profile",
    "name": "Google Business Profile",
    "description": "Manage your Google Business Profile: business info, hours, posts, and review replies",
    "categories": [
      "Google"
    ]
  },
  {
    "id": "moneybird",
    "name": "Moneybird",
    "description": "Manage invoices, quotes, contacts, bookkeeping documents and bank transactions in your Moneybird administration",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "bluesky",
    "name": "Bluesky",
    "description": "Publish posts to Bluesky (AT Protocol) — personal or self-hosted PDS",
    "categories": [
      "Social media"
    ]
  },
  {
    "id": "wordpress",
    "name": "WordPress",
    "description": "Manage posts, pages, and media on your WordPress site",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "lightspeed-restaurant",
    "name": "Lightspeed Restaurant",
    "description": "Read sales, receipts and menu items from Lightspeed Restaurant (K-Series)",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "zenchef-formitable",
    "name": "Zenchef (Formitable)",
    "description": "Read reservations and covers from your Zenchef / Formitable account",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "bird-whatsapp-business",
    "name": "Bird (WhatsApp Business)",
    "description": "Send and receive WhatsApp messages and voice calls via Bird",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "whatsapp-business",
    "name": "WhatsApp Business",
    "description": "Send and receive WhatsApp messages directly through Meta's Cloud API",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "1password-events-api",
    "name": "1Password (Events API)",
    "description": "Connect 1Password (Events API) (iam) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "1password-scim",
    "name": "1Password (SCIM)",
    "description": "Connect 1Password (SCIM) (iam) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "activecampaign",
    "name": "ActiveCampaign",
    "description": "Connect ActiveCampaign (marketing, communication) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "adyntel",
    "name": "Adyntel",
    "description": "Connect Adyntel (marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "ahrefs",
    "name": "Ahrefs",
    "description": "SEO data: backlinks, keywords, rankings and site audits",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "affinity-v1",
    "name": "Affinity (v1)",
    "description": "Relationship intelligence CRM for dealmaking teams",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "affinity-v2",
    "name": "Affinity (v2)",
    "description": "Connect Affinity (v2) (crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "aimfox",
    "name": "Aimfox",
    "description": "Connect Aimfox (surveys) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "aircall-basic-auth",
    "name": "Aircall (Basic Auth)",
    "description": "Connect Aircall (Basic Auth) (support) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "autotask",
    "name": "AutoTask",
    "description": "Connect AutoTask (support, ticketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "algolia",
    "name": "Algolia",
    "description": "Connect Algolia (search) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "amplitude-event-streaming-api",
    "name": "Amplitude (Event Streaming API)",
    "description": "Connect Amplitude (Event Streaming API) (analytics) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "anthropic",
    "name": "Anthropic",
    "description": "Connect Anthropic (productivity, dev-tools, popular) with your API key — direct API access for agents and apps",
    "categories": [
      "AI"
    ]
  },
  {
    "id": "anthropic-administrator",
    "name": "Anthropic Administrator",
    "description": "Connect Anthropic Administrator (productivity, dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "apollo-api-key",
    "name": "Apollo (API Key)",
    "description": "B2B contact database with sales engagement and pipeline tools",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "asana-scim-api",
    "name": "Asana (SCIM API)",
    "description": "Connect Asana (SCIM API) (productivity, ticketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "ashby",
    "name": "Ashby",
    "description": "Connect Ashby (ats, popular) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "attention",
    "name": "Attention",
    "description": "Connect Attention (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "auvik",
    "name": "Auvik",
    "description": "Connect Auvik (support) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "avalara",
    "name": "Avalara",
    "description": "Connect Avalara (legal) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "avalara-sandbox",
    "name": "Avalara (Sandbox)",
    "description": "Connect Avalara (Sandbox) (legal) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "avoma",
    "name": "Avoma",
    "description": "Connect Avoma (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "aws-scim",
    "name": "AWS (SCIM)",
    "description": "Connect AWS (SCIM) (dev-tools, iam) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "bamboohr-basic-auth",
    "name": "BambooHR (Basic Auth)",
    "description": "Connect BambooHR (Basic Auth) (hr) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "beehiiv",
    "name": "Beehiiv",
    "description": "Connect Beehiiv (communication, marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "bettercontact",
    "name": "BetterContact",
    "description": "Connect BetterContact (crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "blandai",
    "name": "BlandAI",
    "description": "Connect BlandAI (support) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "brevo",
    "name": "Brevo",
    "description": "Connect Brevo (marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "builder-io-private",
    "name": "Builder.io (Private)",
    "description": "Connect Builder.io (Private) (dev-tools, design, cms) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "builder-io-public",
    "name": "Builder.io (Public)",
    "description": "Connect Builder.io (Public) (dev-tools, design, cms) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "buildium",
    "name": "Buildium",
    "description": "Connect Buildium (accounting, crm, payment) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "cal-com-v2",
    "name": "Cal.com (v2)",
    "description": "Connect Cal.com (v2) (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "callrail",
    "name": "Callrail",
    "description": "Connect Callrail (marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "canny",
    "name": "Canny",
    "description": "Connect Canny (support) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "canva-scim-api",
    "name": "Canva (SCIM API)",
    "description": "Connect Canva (SCIM API) (design, dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "certn",
    "name": "Certn",
    "description": "Connect Certn (legal) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "chargebee",
    "name": "Chargebee",
    "description": "Connect Chargebee (payment) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "chatarmin",
    "name": "Chatarmin",
    "description": "Connect Chatarmin (communication) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "chattermill",
    "name": "Chattermill",
    "description": "Connect Chattermill (support, analytics) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "chorus",
    "name": "Chorus",
    "description": "Connect Chorus (analytics) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "cin7-core",
    "name": "Cin7 Core",
    "description": "Connect Cin7 Core (e-commerce) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "clari-copilot",
    "name": "Clari Copilot",
    "description": "Connect Clari Copilot (marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "clay",
    "name": "Clay",
    "description": "Connect Clay (crm, marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "clickhouse",
    "name": "ClickHouse",
    "description": "Connect ClickHouse (dev-tools) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "clicksend",
    "name": "ClickSend",
    "description": "Connect ClickSend (communication) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "cloudtalk",
    "name": "CloudTalk",
    "description": "Connect CloudTalk (communication) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "clerk",
    "name": "Clerk",
    "description": "Connect Clerk (dev-tools, iam) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "coda",
    "name": "Coda",
    "description": "Connect Coda (knowledge-base, productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "code-climate",
    "name": "Code Climate",
    "description": "Connect Code Climate (dev-tools, productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "codegen",
    "name": "Codegen",
    "description": "Connect Codegen (dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "companycam",
    "name": "CompanyCam",
    "description": "Connect CompanyCam (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "copper-api-key",
    "name": "Copper (API Key)",
    "description": "Connect Copper (API Key) (crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "confluence-basic-auth",
    "name": "Confluence (Basic Auth)",
    "description": "Connect Confluence (Basic Auth) (knowledge-base) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "cyberimpact",
    "name": "Cyberimpact",
    "description": "Connect Cyberimpact (marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "cursor",
    "name": "Cursor",
    "description": "Connect Cursor (dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "cursor-admin",
    "name": "Cursor Admin",
    "description": "Connect Cursor Admin (dev-tools) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "datacandy",
    "name": "DataCandy",
    "description": "Connect DataCandy (payment) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "datadog",
    "name": "Datadog",
    "description": "Connect Datadog (analytics, dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "devin",
    "name": "Devin",
    "description": "Connect Devin (dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "diffbot",
    "name": "Diffbot",
    "description": "Connect Diffbot (analytics) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "discolike",
    "name": "DiscoLike",
    "description": "Connect DiscoLike (marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "crisp",
    "name": "Crisp",
    "description": "Connect Crisp (communication, support) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "crunchbase",
    "name": "Crunchbase",
    "description": "Connect Crunchbase (crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "dixa",
    "name": "Dixa",
    "description": "Connect Dixa (support) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "contactout",
    "name": "ContactOut",
    "description": "Connect ContactOut (crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "eleven-labs",
    "name": "Eleven Labs",
    "description": "AI voice generation, text to speech and voice cloning",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "energy-performance-certificates-gov-uk",
    "name": "Energy Performance Certificates (Gov.UK)",
    "description": "Connect Energy Performance Certificates (Gov.UK) (other) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "evaluagent",
    "name": "EvaluAgent",
    "description": "Connect EvaluAgent (support) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "fairing",
    "name": "Fairing",
    "description": "Connect Fairing (marketing, analytics) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "fiber-ai",
    "name": "Fiber AI",
    "description": "Connect Fiber AI (analytics) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "fathom",
    "name": "Fathom",
    "description": "Connect Fathom (communication, video) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "fellow",
    "name": "Fellow",
    "description": "Connect Fellow (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "freepik",
    "name": "Freepik",
    "description": "Connect Freepik (other) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "figma-scim",
    "name": "Figma (SCIM)",
    "description": "Connect Figma (SCIM) (design, productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "fal-ai",
    "name": "fal.ai",
    "description": "Connect fal.ai (productivity, dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "fireflies",
    "name": "Fireflies",
    "description": "Connect Fireflies (analytics, communication, productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "firstbase",
    "name": "Firstbase",
    "description": "Connect Firstbase (hr) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "fiserv-api-key",
    "name": "Fiserv (API Key)",
    "description": "Connect Fiserv (API Key) (banking, payment) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "fillout-api-key",
    "name": "Fillout (API Key)",
    "description": "Connect Fillout (API Key) (surveys) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "float",
    "name": "Float",
    "description": "Connect Float (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "folk",
    "name": "Folk",
    "description": "Connect Folk (crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "freshdesk",
    "name": "FreshDesk",
    "description": "Connect FreshDesk (support) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "freshsales",
    "name": "Freshsales",
    "description": "Connect Freshsales (crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "freshservice",
    "name": "Freshservice",
    "description": "Connect Freshservice (support) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "front-api-key",
    "name": "Front (API Key)",
    "description": "Connect Front (API Key) (support, ticketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "fullenrich",
    "name": "FullEnrich",
    "description": "Connect FullEnrich (crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "google-gemini",
    "name": "Google Gemini",
    "description": "Connect Google Gemini (productivity, dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Google",
      "AI"
    ]
  },
  {
    "id": "gem",
    "name": "Gem",
    "description": "Connect Gem (ats) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "grammarly-scim",
    "name": "Grammarly SCIM",
    "description": "Connect Grammarly SCIM (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "granola",
    "name": "Granola",
    "description": "Connect Granola (productivity, knowledge-base) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "guru",
    "name": "Guru",
    "description": "Connect Guru (knowledge-base) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "guru-scim",
    "name": "Guru (SCIM)",
    "description": "Connect Guru (SCIM) (knowledge-base) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "github-personal-access-token",
    "name": "Github (Personal Access Token)",
    "description": "Connect Github (Personal Access Token) (dev-tools, ticketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "gitlab-personal-access-token",
    "name": "GitLab (Personal Access Token)",
    "description": "Connect GitLab (Personal Access Token) (dev-tools, ticketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "ghost-content-api",
    "name": "Ghost (Content API)",
    "description": "Connect Ghost (Content API) (dev-tools, design, cms) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "glyphic",
    "name": "Glyphic",
    "description": "Connect Glyphic (communication) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "gamma",
    "name": "Gamma",
    "description": "Connect Gamma (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "grafana",
    "name": "Grafana",
    "description": "Connect Grafana (dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "grain-api-key",
    "name": "Grain (API Key)",
    "description": "Connect Grain (API Key) (video, communication, productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "greenhouse-basic-auth",
    "name": "Greenhouse (Basic Auth)",
    "description": "Connect Greenhouse (Basic Auth) (ats) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "greenhouse-harvest-api",
    "name": "Greenhouse (Harvest API)",
    "description": "Connect Greenhouse (Harvest API) (ats) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "greenhouse-job-board-api",
    "name": "Greenhouse (Job Board API)",
    "description": "Connect Greenhouse (Job Board API) (ats) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "greenhouse-assessment-api",
    "name": "Greenhouse (Assessment API)",
    "description": "Connect Greenhouse (Assessment API) (ats) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "grist",
    "name": "Grist",
    "description": "Connect Grist (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "hackerrank-work",
    "name": "HackerRank Work",
    "description": "Connect HackerRank Work (ats) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "heyreach",
    "name": "HeyReach",
    "description": "Connect HeyReach (social, marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "hibob-service-user",
    "name": "Hibob Service User",
    "description": "Connect Hibob Service User (hr, popular) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "holded",
    "name": "Holded",
    "description": "Connect Holded (accounting, crm, invoicing) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "huntress",
    "name": "Huntress",
    "description": "Connect Huntress (other) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "incident-io",
    "name": "Incident.io",
    "description": "Connect Incident.io (ticketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "insightly",
    "name": "Insightly",
    "description": "Connect Insightly (crm) with your credentials — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "icypeas",
    "name": "Icypeas",
    "description": "Connect Icypeas (marketing, crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "it-glue",
    "name": "IT Glue",
    "description": "Connect IT Glue (productivity, other) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "jazzhr",
    "name": "JazzHR",
    "description": "Connect JazzHR (hr, ats) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "jiminny",
    "name": "Jiminny",
    "description": "Connect Jiminny (productivity, communication) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "jira-basic-auth",
    "name": "Jira (Basic Auth)",
    "description": "Connect Jira (Basic Auth) (productivity, ticketing) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "jobvite",
    "name": "Jobvite",
    "description": "Connect Jobvite (ats) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "jumpcloud",
    "name": "JumpCloud",
    "description": "Connect JumpCloud (iam) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "help-scout-docs",
    "name": "Help Scout Docs",
    "description": "Connect Help Scout Docs (knowledge-base, support) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "keeper-scim",
    "name": "Keeper (SCIM)",
    "description": "Connect Keeper (SCIM) (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "kintone-user-api",
    "name": "Kintone User API",
    "description": "Connect Kintone User API (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "klipfolio",
    "name": "Klipfolio",
    "description": "Connect Klipfolio (productivity, dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "klaviyo-api-key",
    "name": "Klaviyo (API Key)",
    "description": "Email and SMS marketing for e-commerce brands",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "leadmagic",
    "name": "LeadMagic",
    "description": "Connect LeadMagic (marketing, crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "leadfeeder",
    "name": "Leadfeeder",
    "description": "Connect Leadfeeder (marketing, crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "lemlist",
    "name": "lemlist",
    "description": "Connect lemlist (marketing, communication) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "lightfield",
    "name": "Lightfield",
    "description": "Connect Lightfield (crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "loom-scim",
    "name": "Loom (SCIM)",
    "description": "Connect Loom (SCIM) (other) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "loops-so",
    "name": "Loops.so",
    "description": "Connect Loops.so (marketing, communication) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "lucid-scim",
    "name": "Lucid (SCIM)",
    "description": "Connect Lucid (SCIM) (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "luma",
    "name": "Luma",
    "description": "Connect Luma (productivity, ticketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "listmonk",
    "name": "Listmonk",
    "description": "Connect Listmonk (marketing) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "lob",
    "name": "Lob",
    "description": "Connect Lob (marketing) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "make",
    "name": "Make",
    "description": "Connect Make (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "mailjet",
    "name": "Mailjet",
    "description": "Connect Mailjet (marketing) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "manatal",
    "name": "Manatal",
    "description": "Connect Manatal (crm, hr, ats) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "mattermost",
    "name": "Mattermost",
    "description": "Connect Mattermost (communication) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "metabase",
    "name": "Metabase",
    "description": "Connect Metabase (analytics) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "maxio",
    "name": "Maxio",
    "description": "Connect Maxio (payment) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "mindbody",
    "name": "Mindbody",
    "description": "Connect Mindbody (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "miro-scim-api",
    "name": "Miro (SCIM API)",
    "description": "Connect Miro (SCIM API) (design, productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "juniper-mist",
    "name": "Juniper Mist",
    "description": "Connect Juniper Mist (dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "momentum-io",
    "name": "Momentum.io",
    "description": "Connect Momentum.io (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "modjo-ai",
    "name": "Modjo AI",
    "description": "Connect Modjo AI (crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "ninjaone-saas-backup",
    "name": "NinjaOne SaaS Backup",
    "description": "Connect NinjaOne SaaS Backup (storage, productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "nocrm-io",
    "name": "nocrm.io",
    "description": "Connect nocrm.io (crm, productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "northbeam",
    "name": "Northbeam",
    "description": "Connect Northbeam (analytics, marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "notion-scim-api",
    "name": "Notion (SCIM API)",
    "description": "Connect Notion (SCIM API) (knowledge-base, productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "nyne-ai",
    "name": "Nyne AI",
    "description": "Connect Nyne AI (analytics) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "ocean-io",
    "name": "Ocean.io",
    "description": "Connect Ocean.io (crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "oomnitza",
    "name": "Oomnitza",
    "description": "Connect Oomnitza (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "openai",
    "name": "OpenAI",
    "description": "Connect OpenAI (productivity, dev-tools, popular) with your API key — direct API access for agents and apps",
    "categories": [
      "AI"
    ]
  },
  {
    "id": "openai-admin",
    "name": "OpenAI (Admin)",
    "description": "Connect OpenAI (Admin) (productivity, dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "open-hands",
    "name": "Open Hands",
    "description": "Connect Open Hands (dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "ordinal",
    "name": "Ordinal",
    "description": "Connect Ordinal (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "paligo",
    "name": "Paligo",
    "description": "Connect Paligo (cms) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "pandadoc-api-key",
    "name": "Pandadoc (API Key)",
    "description": "Connect Pandadoc (API Key) (legal) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "pendo",
    "name": "Pendo",
    "description": "Connect Pendo (analytics) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "pennylane-company-api",
    "name": "Pennylane (Company API)",
    "description": "Connect Pennylane (Company API) (accounting, banking, invoicing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "perdoo",
    "name": "Perdoo",
    "description": "Connect Perdoo (productivity, analytics) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "perplexity",
    "name": "Perplexity",
    "description": "Connect Perplexity (productivity, dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "AI"
    ]
  },
  {
    "id": "personio-recruiting",
    "name": "Personio Recruiting",
    "description": "Connect Personio Recruiting (hr, ats) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "rocketlane",
    "name": "Rocketlane",
    "description": "Connect Rocketlane (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "pylon",
    "name": "Pylon",
    "description": "Connect Pylon (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "pipedream-api-key",
    "name": "Pipedream (API Key)",
    "description": "Connect Pipedream (API Key) (dev-tools, productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "planning-center-online-personal-access-token",
    "name": "Planning Center Online (Personal Access Token)",
    "description": "Connect Planning Center Online (Personal Access Token) (crm, productivity) with your credentials — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "plain",
    "name": "Plain",
    "description": "Connect Plain (support) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "prospeo",
    "name": "Prospeo",
    "description": "Connect Prospeo (crm, marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "prtg-classic",
    "name": "PRTG Classic",
    "description": "Connect PRTG Classic (support) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "quentn",
    "name": "Quentn",
    "description": "Connect Quentn (marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "quipteams",
    "name": "Quipteams",
    "description": "Connect Quipteams (other) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "ragie-ai",
    "name": "Ragie AI",
    "description": "Connect Ragie AI (dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "razorpay",
    "name": "Razorpay",
    "description": "Connect Razorpay (payment) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "readwise",
    "name": "Readwise",
    "description": "Connect Readwise (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "readwise-reader",
    "name": "Readwise Reader",
    "description": "Connect Readwise Reader (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "recall-ai",
    "name": "Recall.ai",
    "description": "Connect Recall.ai (dev-tools, productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "recruitcrm",
    "name": "Recruitcrm",
    "description": "Connect Recruitcrm (hr, ats) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "recruitee",
    "name": "Recruitee",
    "description": "Connect Recruitee (ats) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "recruiterflow",
    "name": "Recruiterflow",
    "description": "Connect Recruiterflow (hr, ats) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "refiner",
    "name": "Refiner",
    "description": "Connect Refiner (surveys) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "replicate",
    "name": "Replicate",
    "description": "Connect Replicate (dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "reply-io",
    "name": "Reply.io",
    "description": "Connect Reply.io (marketing, communication) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "resend",
    "name": "Resend",
    "description": "Connect Resend (communication) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "roam-scim-api",
    "name": "Roam (SCIM API)",
    "description": "Connect Roam (SCIM API) (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "rock-gym-pro",
    "name": "Rock Gym Pro",
    "description": "Connect Rock Gym Pro (crm) with your credentials — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "rootly",
    "name": "Rootly",
    "description": "Connect Rootly (dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "sage-hr",
    "name": "Sage HR",
    "description": "Connect Sage HR (hr) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "semrush-v3",
    "name": "Semrush (v3)",
    "description": "SEO and competitive research: keywords, backlinks and traffic",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "sentinelone",
    "name": "SentinelOne",
    "description": "Connect SentinelOne (dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "shipbob-personal-access-token",
    "name": "ShipBob (Personal Access Token)",
    "description": "Connect ShipBob (Personal Access Token) (e-commerce) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "shippo",
    "name": "Shippo",
    "description": "Connect Shippo (e-commerce) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "shipstation-v1",
    "name": "Shipstation (v1)",
    "description": "Connect Shipstation (v1) (e-commerce) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "shipstation-v2",
    "name": "Shipstation (v2)",
    "description": "Connect Shipstation (v2) (e-commerce) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "shopify-api-key",
    "name": "Shopify (API Key)",
    "description": "Connect Shopify (API Key) (e-commerce) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "shopify-partner",
    "name": "Shopify Partner",
    "description": "Connect Shopify Partner (e-commerce) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "shopify-scim-api",
    "name": "Shopify (SCIM API)",
    "description": "Connect Shopify (SCIM API) (e-commerce) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "shortcut",
    "name": "Shortcut",
    "description": "Connect Shortcut (dev-tools, productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "smartlead-ai",
    "name": "Smartlead.ai",
    "description": "Connect Smartlead.ai (communication, marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "smartrecruiters",
    "name": "Smartrecruiters",
    "description": "Connect Smartrecruiters (ats) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "statista",
    "name": "Statista",
    "description": "Connect Statista (analytics) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "storecensus",
    "name": "StoreCensus",
    "description": "Connect StoreCensus (e-commerce, crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "streak",
    "name": "Streak",
    "description": "Connect Streak (crm) with your credentials — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "supabase",
    "name": "Supabase",
    "description": "Open-source Postgres backend with auth, storage and APIs",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "supabase-mcp",
    "name": "Supabase (MCP)",
    "description": "Connect Supabase (MCP) (dev-tools, mcp) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "tailscale-api-key",
    "name": "Tailscale (API Key)",
    "description": "Connect Tailscale (API Key) (dev-tools, productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "talentlms",
    "name": "TalentLMS",
    "description": "Connect TalentLMS (other) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "tally",
    "name": "Tally",
    "description": "Connect Tally (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "tanium",
    "name": "Tanium",
    "description": "Connect Tanium (dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "teamtailor",
    "name": "Teamtailor",
    "description": "Connect Teamtailor (ats) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "telegram",
    "name": "Telegram",
    "description": "Connect Telegram (communication) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "the-swarm",
    "name": "The Swarm",
    "description": "Connect The Swarm (crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "theirstack",
    "name": "TheirStack",
    "description": "Connect TheirStack (marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "terraform",
    "name": "Terraform",
    "description": "Connect Terraform (dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "thrivecart-api-key",
    "name": "ThriveCart (API Key)",
    "description": "Connect ThriveCart (API Key) (e-commerce, payment) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "trakstar-hire",
    "name": "Trakstar Hire",
    "description": "Connect Trakstar Hire (ats) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "triple-whale",
    "name": "Triple Whale",
    "description": "Connect Triple Whale (analytics, marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "toggl-track",
    "name": "Toggl Track",
    "description": "Connect Toggl Track (productivity) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "torii",
    "name": "Torii",
    "description": "Connect Torii (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "twenty-crm",
    "name": "Twenty CRM",
    "description": "Connect Twenty CRM (crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "twenty-crm-self-hosted",
    "name": "Twenty CRM (Self Hosted)",
    "description": "Connect Twenty CRM (Self Hosted) (crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "twilio",
    "name": "Twilio",
    "description": "Connect Twilio (dev-tools, communication) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "typefully",
    "name": "Typefully",
    "description": "Connect Typefully (analytics, communication, social) with your API key — direct API access for agents and apps",
    "categories": [
      "Social media"
    ]
  },
  {
    "id": "typefully-api-v2",
    "name": "Typefully (API v2)",
    "description": "Connect Typefully (API v2) (analytics, communication, social) with your API key — direct API access for agents and apps",
    "categories": [
      "Social media"
    ]
  },
  {
    "id": "unanet",
    "name": "Unanet",
    "description": "Connect Unanet (crm, erp, accounting) with your credentials — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "unipile",
    "name": "Unipile",
    "description": "Connect Unipile (crm, marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "upsales",
    "name": "Upsales",
    "description": "Connect Upsales (crm) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "vercel",
    "name": "Vercel",
    "description": "Connect Vercel (dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "valley-api-key",
    "name": "Valley (API Key)",
    "description": "Connect Valley (API Key) (marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "wappalyzer",
    "name": "Wappalyzer",
    "description": "Connect Wappalyzer (marketing, analytics) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "webinarjam",
    "name": "WebinarJam",
    "description": "Connect WebinarJam (marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "wiza",
    "name": "Wiza",
    "description": "Connect Wiza (crm, marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "CRM"
    ]
  },
  {
    "id": "woocommerce",
    "name": "WooCommerce",
    "description": "Connect WooCommerce (e-commerce, dev-tools, design) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "workos",
    "name": "WorkOS",
    "description": "Connect WorkOS (productivity, iam) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "workpath",
    "name": "Workpath",
    "description": "Connect Workpath (productivity) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "wise-api-key",
    "name": "Wise (API Key)",
    "description": "Connect Wise (API Key) (banking, payment) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "xai",
    "name": "xAI",
    "description": "Connect xAI (productivity, dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "AI"
    ]
  },
  {
    "id": "youcanbookme",
    "name": "YouCanBookMe",
    "description": "Connect YouCanBookMe (productivity) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "zapier-scim-api",
    "name": "Zapier (SCIM API)",
    "description": "Connect Zapier (SCIM API) (dev-tools) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "zendesk-api-token",
    "name": "Zendesk (API Token)",
    "description": "Connect Zendesk (API Token) (support, ticketing) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "zigpoll",
    "name": "Zigpoll",
    "description": "Connect Zigpoll (marketing) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "zorus",
    "name": "Zorus",
    "description": "Connect Zorus (other) with your API key — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "dataforseo",
    "name": "DataForSEO",
    "description": "Connect DataForSEO (marketing, analytics) with your credentials — direct API access for agents and apps",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "serpapi",
    "name": "SerpApi",
    "description": "Search engine results as structured JSON through an API",
    "categories": [
      "Other"
    ]
  },
  {
    "id": "ollama",
    "name": "Ollama",
    "description": "Run your service assistant with models on your own server.",
    "categories": [
      "AI"
    ]
  },
  {
    "id": "deepseek",
    "name": "DeepSeek",
    "description": "Connect your DeepSeek API account to Chat and App builder.",
    "categories": [
      "AI"
    ]
  },
  {
    "id": "quickbooks-online",
    "name": "QuickBooks Online",
    "description": "Connect customers, invoices and accounting records.",
    "categories": [
      "Accounting"
    ]
  },
  {
    "id": "quickbooks-desktop",
    "name": "QuickBooks Desktop",
    "description": "Exchange accounting records with QuickBooks Desktop.",
    "categories": [
      "Accounting"
    ]
  }
];
