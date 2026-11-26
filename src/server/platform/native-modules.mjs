// Versioned native ownership catalog. Identity/relation coverage only; not a CRUD schema.
export const nativeModules = [
  {
    "id": "cacc51b8-3cb0-543d-97c4-6e92bfdf68b6",
    "key": "identity",
    "label": "Identity",
    "contractVersion": 1,
    "availability": "source",
    "dependencies": [],
    "objects": [
      {
        "id": "3fc30160-65c8-5724-8e58-1592d4bd5888",
        "key": "identity.user",
        "label": "User",
        "kind": "record",
        "storageProfile": "workspace",
        "writeMode": "domain_commands",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": []
      }
    ]
  },
  {
    "id": "e773f296-403c-5d8e-aa89-ed44f394d3d3",
    "key": "crm",
    "label": "CRM",
    "contractVersion": 1,
    "availability": "source",
    "dependencies": [
      "identity"
    ],
    "objects": [
      {
        "id": "e7ebd790-ef14-5965-b1ed-8ed0b127125b",
        "key": "crm.customer",
        "label": "Customer",
        "kind": "record",
        "storageProfile": "service",
        "writeMode": "domain_commands",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": []
      },
      {
        "id": "304dc643-25c6-506f-950e-2befa1ae181c",
        "key": "crm.contact",
        "label": "Contact",
        "kind": "record",
        "storageProfile": "service",
        "writeMode": "domain_commands",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": [
          {
            "key": "customer",
            "target": "crm.customer",
            "cardinality": "many_to_one",
            "required": true
          },
          {
            "key": "site",
            "target": "crm.site",
            "cardinality": "many_to_one",
            "required": false
          }
        ]
      },
      {
        "id": "bc030ed7-584b-562e-9693-c20c06089c11",
        "key": "crm.site",
        "label": "Service location",
        "kind": "record",
        "storageProfile": "service",
        "writeMode": "domain_commands",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": [
          {
            "key": "customer",
            "target": "crm.customer",
            "cardinality": "many_to_one",
            "required": true
          }
        ]
      }
    ]
  },
  {
    "id": "2e70f106-c81b-525e-b00d-f99fa4db29be",
    "key": "equipment",
    "label": "Equipment",
    "contractVersion": 1,
    "availability": "source",
    "dependencies": [
      "crm"
    ],
    "objects": [
      {
        "id": "06c9e7e9-7226-5996-98f5-c2ba2599279d",
        "key": "equipment.asset",
        "label": "Equipment",
        "kind": "record",
        "storageProfile": "service",
        "writeMode": "domain_commands",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": [
          {
            "key": "customer",
            "target": "crm.customer",
            "cardinality": "many_to_one",
            "required": true
          },
          {
            "key": "site",
            "target": "crm.site",
            "cardinality": "many_to_one",
            "required": true
          }
        ]
      }
    ]
  },
  {
    "id": "ddc05681-4222-504d-a46e-60967bac418c",
    "key": "service",
    "label": "Field Service",
    "contractVersion": 1,
    "availability": "source",
    "dependencies": [
      "crm",
      "equipment",
      "identity"
    ],
    "objects": [
      {
        "id": "9b153704-17d3-54b7-a4f7-f325b536eb0f",
        "key": "service.job",
        "label": "Job / Work Order",
        "kind": "record",
        "storageProfile": "service",
        "writeMode": "domain_commands",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": [
          {
            "key": "customer",
            "target": "crm.customer",
            "cardinality": "many_to_one",
            "required": true
          },
          {
            "key": "asset",
            "target": "equipment.asset",
            "cardinality": "many_to_one",
            "required": false
          }
        ]
      },
      {
        "id": "db3d706c-58ce-50c7-95a2-0ad127f0b49c",
        "key": "service.technician",
        "label": "Technician",
        "kind": "record",
        "storageProfile": "service",
        "writeMode": "domain_commands",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": []
      }
    ]
  },
  {
    "id": "7548d25f-f4df-57bd-9cc6-a0448dc6c528",
    "key": "dispatch",
    "label": "Dispatcher",
    "contractVersion": 1,
    "availability": "source",
    "dependencies": [
      "service"
    ],
    "objects": []
  },
  {
    "id": "44d49378-6b48-5049-8812-27bd4f46c30b",
    "key": "inventory",
    "label": "Inventory",
    "contractVersion": 1,
    "availability": "source",
    "dependencies": [
      "service"
    ],
    "objects": [
      {
        "id": "9da3f23d-ccff-5cf7-b6e3-890d58dea652",
        "key": "inventory.material",
        "label": "Material",
        "kind": "record",
        "storageProfile": "service",
        "writeMode": "domain_commands",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": []
      },
      {
        "id": "eafd62eb-88eb-539c-a28c-7ac322256371",
        "key": "inventory.location",
        "label": "Stock location",
        "kind": "record",
        "storageProfile": "service",
        "writeMode": "domain_commands",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": [
          {
            "key": "technician",
            "target": "service.technician",
            "cardinality": "many_to_one",
            "required": false
          }
        ]
      },
      {
        "id": "2f7c2fa4-34e6-53a2-8153-3808fb9af4ca",
        "key": "inventory.movement",
        "label": "Stock movement",
        "kind": "ledger",
        "storageProfile": "service",
        "writeMode": "read_only",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": [
          {
            "key": "material",
            "target": "inventory.material",
            "cardinality": "many_to_one",
            "required": true
          },
          {
            "key": "job",
            "target": "service.job",
            "cardinality": "many_to_one",
            "required": false
          }
        ]
      }
    ]
  },
  {
    "id": "18f19427-a072-551f-87dc-c7b18cad68b1",
    "key": "sales",
    "label": "Sales",
    "contractVersion": 1,
    "availability": "source",
    "dependencies": [
      "crm",
      "service",
      "inventory",
      "identity",
      "equipment"
    ],
    "objects": [
      {
        "id": "217e709d-e62d-5375-8662-4edbea8c5a4f",
        "key": "sales.opportunity",
        "label": "Opportunity",
        "kind": "record",
        "storageProfile": "service",
        "writeMode": "domain_commands",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": [
          {
            "key": "customer",
            "target": "crm.customer",
            "cardinality": "many_to_one",
            "required": false
          },
          {
            "key": "site",
            "target": "crm.site",
            "cardinality": "many_to_one",
            "required": false
          },
          {
            "key": "asset",
            "target": "equipment.asset",
            "cardinality": "many_to_one",
            "required": false
          }
        ]
      },
      {
        "id": "01701d15-c0e4-5959-8f60-44c3d532b8bb",
        "key": "sales.quote",
        "label": "Quote",
        "kind": "record",
        "storageProfile": "service",
        "writeMode": "domain_commands",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": [
          {
            "key": "opportunity",
            "target": "sales.opportunity",
            "cardinality": "many_to_one",
            "required": true
          }
        ]
      },
      {
        "id": "aa68166f-0613-56c0-b28b-fd95e9737079",
        "key": "sales.offer",
        "label": "Frozen quote offer",
        "kind": "snapshot",
        "storageProfile": "service",
        "writeMode": "read_only",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": [
          {
            "key": "quote",
            "target": "sales.quote",
            "cardinality": "many_to_one",
            "required": true
          }
        ]
      }
    ]
  },
  {
    "id": "15099daf-5907-531e-9236-e48f231d99c1",
    "key": "finance",
    "label": "Finance",
    "contractVersion": 1,
    "availability": "source",
    "dependencies": [
      "crm",
      "service"
    ],
    "objects": [
      {
        "id": "c65873ad-e2ae-5a5b-99e8-1e3c2eb3e0b7",
        "key": "finance.invoice",
        "label": "Invoice",
        "kind": "record",
        "storageProfile": "service",
        "writeMode": "domain_commands",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": [
          {
            "key": "customer",
            "target": "crm.customer",
            "cardinality": "many_to_one",
            "required": true
          },
          {
            "key": "job",
            "target": "service.job",
            "cardinality": "many_to_one",
            "required": false
          }
        ]
      },
      {
        "id": "567513f4-621c-54cd-93b1-c16e691d53f8",
        "key": "finance.receipt",
        "label": "Invoice receipt",
        "kind": "ledger",
        "storageProfile": "service",
        "writeMode": "read_only",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": [
          {
            "key": "invoice",
            "target": "finance.invoice",
            "cardinality": "many_to_one",
            "required": true
          }
        ]
      },
      {
        "id": "a81c63eb-258e-561b-94ae-5a38603c62b1",
        "key": "finance.credit",
        "label": "Invoice credit",
        "kind": "ledger",
        "storageProfile": "service",
        "writeMode": "read_only",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": [
          {
            "key": "invoice",
            "target": "finance.invoice",
            "cardinality": "many_to_one",
            "required": true
          }
        ]
      }
    ]
  },
  {
    "id": "a956b5d7-cad4-5760-b93e-5ff28f6bdb85",
    "key": "purchasing",
    "label": "Purchasing",
    "contractVersion": 1,
    "availability": "source",
    "dependencies": [
      "inventory",
      "service"
    ],
    "objects": [
      {
        "id": "bae1c3e4-ca8e-5faa-b75b-2ea330ff0e49",
        "key": "purchasing.order",
        "label": "Purchase order",
        "kind": "record",
        "storageProfile": "service",
        "writeMode": "domain_commands",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": []
      }
    ]
  },
  {
    "id": "ef0dc8c4-0e55-59e4-8e32-87e369f84c37",
    "key": "fleet",
    "label": "Fleet",
    "contractVersion": 1,
    "availability": "source",
    "dependencies": [
      "inventory"
    ],
    "objects": [
      {
        "id": "d88ee843-16cc-53ce-967e-69de8aba0261",
        "key": "fleet.vehicle",
        "label": "Vehicle",
        "kind": "record",
        "storageProfile": "service",
        "writeMode": "domain_commands",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": [
          {
            "key": "stock_location",
            "target": "inventory.location",
            "cardinality": "many_to_one",
            "required": true
          }
        ]
      }
    ]
  },
  {
    "id": "23ac76c2-e5e0-50ce-859d-0942bb75cfc0",
    "key": "agreements",
    "label": "Contracts",
    "contractVersion": 1,
    "availability": "source",
    "dependencies": [
      "crm",
      "equipment",
      "service"
    ],
    "objects": [
  {
    "id": "e9004d26-456e-54c4-8542-646c930448d1",
    "key": "agreements.draft",
    "label": "Agreement draft",
    "kind": "record",
    "storageProfile": "service",
    "writeMode": "domain_commands",
    "fields": [
      {
        "key": "id",
        "label": "Native identity",
        "type": "identifier",
        "systemManaged": true
      },
      {
        "key": "title",
        "label": "Draft title",
        "type": "text",
        "systemManaged": false
      },
      {
        "key": "version",
        "label": "Draft revision",
        "type": "integer",
        "systemManaged": true
      }
    ],
    "relations": [
      {
        "key": "customer",
        "target": "crm.customer",
        "cardinality": "many_to_one",
        "required": true
      }
    ]
  }
]
  },
  {
    "id": "015d02d3-04db-503b-b4ff-8df291f82530",
    "key": "projects",
    "label": "Projects",
    "contractVersion": 1,
    "availability": "planned",
    "dependencies": [
      "crm",
      "service",
      "purchasing"
    ],
    "objects": []
  },
  {
    "id": "3abc6748-4d08-55b2-b8d2-0c5f9261950b",
    "key": "hr",
    "label": "HR",
    "contractVersion": 1,
    "availability": "source",
    "dependencies": [
      "identity",
      "service"
    ],
    "objects": [
      {
        "id": "db936c14-8b0f-5774-ab5b-77c2ff9e65fa",
        "key": "hr.staff",
        "label": "Staff member",
        "kind": "record",
        "storageProfile": "service",
        "writeMode": "domain_commands",
        "fields": [
          {
            "key": "id",
            "label": "Native identity",
            "type": "identifier",
            "systemManaged": true
          }
        ],
        "relations": [
          {
            "key": "technician",
            "target": "service.technician",
            "cardinality": "many_to_one",
            "required": false
          },
          {
            "key": "supervisor",
            "target": "hr.staff",
            "cardinality": "many_to_one",
            "required": false
          }
        ]
      }
    ]
  }
];
