from django.core.management.base import BaseCommand
from django.db import transaction

from links.models import AppLink, Category

# Placeholder data for local development. URLs use example.com, so nothing here points at a real system.
CATEGORIES = [
    {"name": "Core Banking", "icon": "landmark", "order": 1},
    {"name": "Lending & Credit", "icon": "piggy-bank", "order": 2},
    {"name": "HR & People", "icon": "users", "order": 3},
    {"name": "Risk & Compliance", "icon": "shield-check", "order": 4},
    {"name": "IT & Support", "icon": "headset", "order": 5},
]

APPS = [
    {
        "category": "Core Banking",
        "name": "CoreBank",
        "url": "https://corebank.example.com",
        "description": "Customer accounts, deposits, withdrawals and end-of-day processing.",
        "icon": "database",
        "environment": AppLink.Environment.PROD,
        "owner_team": "Core Banking Ops",
        "support_contact": "corebank-support@example.com",
        "tags": "cbs, core, accounts, teller",
    },
    {
        "category": "Core Banking",
        "name": "CoreBank UAT",
        "url": "https://uat.corebank.example.com",
        "description": "Test environment for CoreBank releases. Not for live transactions.",
        "icon": "database",
        "environment": AppLink.Environment.UAT,
        "owner_team": "Core Banking Ops",
        "support_contact": "corebank-support@example.com",
        "tags": "cbs, core, testing",
    },
    {
        "category": "Core Banking",
        "name": "PayGate",
        "url": "https://paygate.example.com",
        "description": "Interbank transfers, NIP payments and settlement reconciliation.",
        "icon": "banknote",
        "environment": AppLink.Environment.PROD,
        "owner_team": "Payments",
        "support_contact": "ext. 2140",
        "tags": "nip, transfers, payments, settlement",
    },
    {
        "category": "Lending & Credit",
        "name": "LoanDesk",
        "url": "https://loandesk.example.com",
        "description": "Loan origination, appraisal and disbursement workflow.",
        "icon": "coins",
        "environment": AppLink.Environment.PROD,
        "owner_team": "Credit Operations",
        "support_contact": "credit-ops@example.com",
        "tags": "loans, credit, microloans, disbursement",
    },
    {
        "category": "Lending & Credit",
        "name": "Collections Tracker",
        "url": "https://collections.example.com",
        "description": "Repayment schedules, overdue accounts and recovery follow-ups.",
        "icon": "clipboard-list",
        "environment": AppLink.Environment.PROD,
        "owner_team": "Recoveries",
        "support_contact": "ext. 2210",
        "tags": "repayment, arrears, recovery",
    },
    {
        "category": "HR & People",
        "name": "PeoplePortal",
        "url": "https://people.example.com",
        "description": "Leave requests, payslips and staff records.",
        "icon": "users",
        "environment": AppLink.Environment.PROD,
        "owner_team": "Human Resources",
        "support_contact": "hr@example.com",
        "tags": "leave, payroll, payslip, hr",
    },
    {
        "category": "HR & People",
        "name": "Learning Hub",
        "url": "https://learn.example.com",
        "description": "Mandatory training, AML courses and certifications.",
        "icon": "graduation-cap",
        "environment": AppLink.Environment.PROD,
        "owner_team": "Learning & Development",
        "support_contact": "training@example.com",
        "tags": "training, courses, lms",
    },
    {
        "category": "Risk & Compliance",
        "name": "AML Watch",
        "url": "https://aml.example.com",
        "description": "Transaction monitoring, alerts and suspicious activity reports.",
        "icon": "shield",
        "environment": AppLink.Environment.PROD,
        "owner_team": "Compliance",
        "support_contact": "compliance@example.com",
        "tags": "aml, kyc, str, monitoring",
    },
    {
        "category": "Risk & Compliance",
        "name": "Regulatory Reports",
        "url": "https://regreports.example.com",
        "description": "Prepare and submit periodic regulatory returns.",
        "icon": "file-text",
        "environment": AppLink.Environment.PROD,
        "owner_team": "Finance & Reporting",
        "support_contact": "ext. 2305",
        "tags": "cbn, returns, reporting",
    },
    {
        "category": "IT & Support",
        "name": "ServiceDesk",
        "url": "https://servicedesk.example.com",
        "description": "Raise IT tickets, request access and track incidents.",
        "icon": "life-buoy",
        "environment": AppLink.Environment.PROD,
        "owner_team": "IT Service Desk",
        "support_contact": "ext. 1000",
        "tags": "helpdesk, tickets, access request, it",
    },
    {
        "category": "IT & Support",
        "name": "DR Console",
        "url": "https://dr.corebank.example.com",
        "description": "Disaster recovery site for CoreBank. Use only during DR drills or failover.",
        "icon": "server",
        "environment": AppLink.Environment.DR,
        "owner_team": "Infrastructure",
        "support_contact": "infra-oncall@example.com",
        "tags": "disaster recovery, failover, drill",
    },
]


class Command(BaseCommand):
    help = "Load placeholder categories and app links for local development. Safe to run more than once."

    @transaction.atomic
    def handle(self, *args, **options):
        categories = {}
        for data in CATEGORIES:
            category, _ = Category.objects.update_or_create(
                name=data["name"], defaults={"icon": data["icon"], "order": data["order"]}
            )
            categories[category.name] = category

        created_count = 0
        for order, data in enumerate(APPS, start=1):
            fields = {**data, "category": categories[data["category"]], "order": order}
            _, created = AppLink.objects.update_or_create(name=fields.pop("name"), defaults=fields)
            created_count += created

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {len(CATEGORIES)} categories and {len(APPS)} apps "
                f"({created_count} new, {len(APPS) - created_count} updated)."
            )
        )
