export interface Integration { id: string; name: string; description: string; categories: string[]; connector?: string }
export const integrationCatalog: Integration[] = [
  {
    "id": "google-workspace",
    "name": "Google Workspace",
    "description": "Read your Google profile, Drive file metadata, calendar events and Gmail headers.",
    "categories": [
      "Google"
    ],
    "connector": "google"
  },
  {
    "id": "gmail",
    "name": "Gmail",
    "description": "Read inbox message headers: subject, sender and date.",
    "categories": [
      "Google"
    ],
    "connector": "google"
  },
  {
    "id": "google-calendar",
    "name": "Google Calendar",
    "description": "Read upcoming events from your primary calendar.",
    "categories": [
      "Google"
    ],
    "connector": "google"
  },
  {
    "id": "google-drive",
    "name": "Google Drive",
    "description": "List recent file names, types and modification times.",
    "categories": [
      "Google"
    ],
    "connector": "google"
  },
  {
    "id": "google-docs",
    "name": "Google Docs",
    "description": "Find document metadata through your Google Drive connection.",
    "categories": [
      "Google"
    ],
    "connector": "google"
  },
  {
    "id": "google-sheets",
    "name": "Google Sheets",
    "description": "Find spreadsheet metadata through your Google Drive connection.",
    "categories": [
      "Google"
    ],
    "connector": "google"
  },
  {
    "id": "microsoft-365",
    "name": "Microsoft 365",
    "description": "Read your profile, Outlook, OneDrive and contacts.",
    "categories": [
      "Microsoft"
    ],
    "connector": "microsoft"
  },
  {
    "id": "outlook",
    "name": "Outlook",
    "description": "Read inbox headers, calendar events and contacts.",
    "categories": [
      "Microsoft"
    ],
    "connector": "microsoft"
  },
  {
    "id": "onedrive",
    "name": "OneDrive",
    "description": "List files and folders in your OneDrive root.",
    "categories": [
      "Microsoft"
    ],
    "connector": "microsoft"
  },
  {
    "id": "excel",
    "name": "Excel",
    "description": "Find workbook metadata through your OneDrive connection.",
    "categories": [
      "Microsoft"
    ],
    "connector": "microsoft"
  },
  {
    "id": "hubspot",
    "name": "HubSpot CRM",
    "description": "Read contacts, companies and deals from your HubSpot account.",
    "categories": [
      "CRM"
    ],
    "connector": "hubspot"
  },
  {
    "id": "linkedin",
    "name": "LinkedIn",
    "description": "Connect and read your LinkedIn profile. Posting is not enabled.",
    "categories": [
      "Social media"
    ],
    "connector": "linkedin"
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
    "id": "openai",
    "name": "OpenAI",
    "description": "Connect your OpenAI API account to Chat and App builder.",
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
  }
];
