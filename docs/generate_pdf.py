from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
from reportlab.lib.enums import TA_CENTER

doc = SimpleDocTemplate("ACI-Ads-Manager-Design-Document.pdf", pagesize=letter,
    topMargin=0.75*inch, bottomMargin=0.75*inch, leftMargin=0.85*inch, rightMargin=0.85*inch)

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="DocTitle", fontName="Helvetica-Bold", fontSize=22, leading=28, textColor=HexColor("#1a1a2e"), spaceAfter=6))
styles.add(ParagraphStyle(name="DocSubtitle", fontName="Helvetica", fontSize=12, leading=16, textColor=HexColor("#555555"), spaceAfter=4))
styles.add(ParagraphStyle(name="SectionHead", fontName="Helvetica-Bold", fontSize=14, leading=20, textColor=HexColor("#1a1a2e"), spaceBefore=20, spaceAfter=10))
styles.add(ParagraphStyle(name="SubHead", fontName="Helvetica-Bold", fontSize=11, leading=15, textColor=HexColor("#333333"), spaceBefore=12, spaceAfter=6))
styles.add(ParagraphStyle(name="Body", fontName="Helvetica", fontSize=10, leading=14, textColor=HexColor("#333333"), spaceAfter=6))
styles.add(ParagraphStyle(name="Bul", fontName="Helvetica", fontSize=10, leading=14, textColor=HexColor("#333333"), leftIndent=20, spaceAfter=3))
styles.add(ParagraphStyle(name="StepText", fontName="Helvetica", fontSize=10, leading=14, textColor=HexColor("#333333"), leftIndent=24, spaceAfter=4))
styles.add(ParagraphStyle(name="Foot", fontName="Helvetica", fontSize=8, textColor=HexColor("#999999"), alignment=TA_CENTER))

def make_table(data, col_widths=None):
    if col_widths is None:
        col_widths = [2*inch, 4.5*inch]
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), HexColor("#1a1a2e")),
        ("TEXTCOLOR", (0,0), (-1,0), HexColor("#ffffff")),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("FONTNAME", (0,1), (0,-1), "Helvetica-Bold"),
        ("BACKGROUND", (0,1), (-1,-1), HexColor("#f8f8f8")),
        ("GRID", (0,0), (-1,-1), 0.5, HexColor("#dddddd")),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
    ]))
    return t

story = []

# Title page
story.append(Spacer(1, 2*inch))
story.append(Paragraph("ACI Ads Manager", styles["DocTitle"]))
story.append(Paragraph("Design Documentation", styles["DocTitle"]))
story.append(Spacer(1, 12))
story.append(Paragraph("Google Ads API Integration - Basic Access Application", styles["DocSubtitle"]))
story.append(Spacer(1, 6))
story.append(HRFlowable(width="100%", thickness=1, color=HexColor("#1a1a2e")))
story.append(Spacer(1, 12))
for line in ["Company: ACI Infotech", "Website: https://aciinfotech.com", "Contact: marketing@aciinfotech.net", "Date: April 2026", "Version: 1.0"]:
    story.append(Paragraph(line, styles["Body"]))
story.append(PageBreak())

# Section 1
story.append(Paragraph("1. Executive Summary", styles["SectionHead"]))
story.append(Paragraph("ACI Ads Manager is an AI-powered campaign management platform built by ACI Infotech for internal use. It integrates with the Google Ads API to programmatically create, manage, and optimize Google Ads campaigns.", styles["Body"]))
story.append(Paragraph("The tool serves as an intelligence and automation layer on top of Google Ads, enabling our marketing team to manage campaigns more efficiently through AI-assisted workflows. All campaign modifications go through a human approval process before being pushed to Google Ads via the API.", styles["Body"]))
story.append(Paragraph("Key capabilities include automated keyword research, AI-generated campaign structures, ad copy generation, performance monitoring, competitor intelligence, and budget optimization - all with mandatory human approval before any changes reach Google Ads.", styles["Body"]))

# Section 2
story.append(Paragraph("2. Company Overview", styles["SectionHead"]))
story.append(make_table([
    ["Field", "Value"],
    ["Company", "ACI Infotech"],
    ["Website", "https://aciinfotech.com"],
    ["Industry", "Technology Consulting (Dynamics 365, Cloud, DevOps)"],
    ["Google Ads Customer ID", "768-735-1996"],
    ["Manager Account ID", "448-865-3547"],
    ["Primary Use", "B2B lead generation for enterprise technology services"],
    ["Target Markets", "United States, Middle East (UAE)"],
    ["Target Audience", "Enterprise decision-makers (CIOs, CTOs, VP Engineering)"],
]))

# Section 3
story.append(Paragraph("3. Technical Architecture", styles["SectionHead"]))
story.append(make_table([
    ["Component", "Technology"],
    ["Platform", "Next.js 16 (React 19, TypeScript)"],
    ["Hosting", "Vercel (serverless functions)"],
    ["Database", "Supabase (PostgreSQL)"],
    ["AI Engine", "Anthropic Claude API (tool_use for structured interactions)"],
    ["Google Ads API", "Version v18 via REST + google-ads-api npm package"],
    ["Authentication", "OAuth 2.0 with offline access (refresh tokens)"],
    ["Scheduling", "Vercel Cron (performance sync, report generation)"],
    ["Email", "Resend API (automated reports)"],
]))
story.append(Spacer(1, 10))
story.append(Paragraph("Architecture Flow:", styles["SubHead"]))
story.append(Paragraph("User Interface (Next.js) -> AI Harness (Claude API with tool_use) -> Approval Queue (Supabase) -> Google Ads API (v18 REST)", styles["Body"]))

# Section 4
story.append(PageBreak())
story.append(Paragraph("4. Google Ads API Usage", styles["SectionHead"]))

for title, bullets in [
    ("4.1 Campaign Management", ["CampaignService: Create, update, pause/resume campaigns", "CampaignBudgetService: Create and manage campaign budgets", "Operations: CREATE, UPDATE (status changes, budget adjustments)"]),
    ("4.2 Ad Group Management", ["AdGroupService: Create ad groups within campaigns", "Operations: CREATE, UPDATE"]),
    ("4.3 Ad Management", ["AdGroupAdService: Create responsive search ads", "Ad types: RESPONSIVE_SEARCH_AD", "Operations: CREATE, UPDATE"]),
    ("4.4 Keyword Management", ["AdGroupCriterionService: Add/remove keywords and negative keywords", "Match types supported: BROAD, PHRASE, EXACT", "Operations: CREATE, UPDATE, REMOVE"]),
    ("4.5 Reporting", ["GoogleAdsService (SearchStream): Query performance metrics", "Metrics: impressions, clicks, cost, conversions, CTR, CPC, quality score", "Frequency: Every 6 hours via automated Vercel Cron sync"]),
    ("4.6 Keyword Planning", ["KeywordPlanIdeaService: Generate keyword ideas", "Used for: Keyword discovery, search volume estimation, competition analysis"]),
]:
    story.append(Paragraph(title, styles["SubHead"]))
    for b in bullets:
        story.append(Paragraph("  " + b, styles["Bul"]))

# Section 5
story.append(Paragraph("5. API Interaction Flow", styles["SectionHead"]))
steps = [
    "Step 1: User instructs the AI via chat interface",
    "Step 2: AI researches keywords using KeywordPlanIdeaService + third-party data",
    "Step 3: AI builds campaign structure (campaign, ad groups, keywords, ads)",
    "Step 4: All changes stored locally in database with draft status",
    "Step 5: Campaign submitted to human approval queue",
    "Step 6: User reviews and approves changes",
    "Step 7: Approved changes pushed to Google Ads API:",
    "    a. CampaignBudgetService.mutate (create budget)",
    "    b. CampaignService.mutate (create campaign, status: PAUSED)",
    "    c. AdGroupService.mutate (create ad groups)",
    "    d. AdGroupCriterionService.mutate (add keywords)",
    "    e. AdGroupAdService.mutate (create ads)",
    "Step 8: Performance data synced back every 6 hours via SearchStream",
]
for s in steps:
    story.append(Paragraph(s, styles["StepText"]))

# Section 6
story.append(PageBreak())
story.append(Paragraph("6. Safety and Compliance", styles["SectionHead"]))

for title, bullets in [
    ("6.1 Human Approval Required", [
        "Every campaign change generated by AI must be approved by a human before being pushed to Google Ads",
        "Approval queue with full audit trail (who approved, when, what changed)",
        "Failed pushes are logged with error details and can be retried",
    ]),
    ("6.2 Budget Safety", [
        "Configurable daily budget warning threshold (default: $500/day)",
        "Hard block threshold for excessive budgets (default: $2,000/day)",
        "Maximum keyword bid cap (default: $50)",
        "Extra-zero detection: flags budgets that appear to be 10x the intended amount",
        "QA Sentinel validates all changes before they enter the approval queue",
    ]),
    ("6.3 Ad Policy Compliance", [
        "Headline character limit enforcement (max 30 characters per headline)",
        "Description character limit enforcement (max 90 characters per description)",
        "Minimum 3 headlines and 2 descriptions per responsive search ad",
        "Duplicate headline/description detection across ads",
        "URL validation for all final URLs (must be http/https)",
        "Display path validation (max 15 characters each)",
    ]),
    ("6.4 Rate Limiting", [
        "Token bucket rate limiter: 40 requests/minute to Google Ads API",
        "Automatic retry with exponential backoff on 429 errors",
        "Token usage tracking per API call logged in agent_logs table",
    ]),
    ("6.5 Data Security", [
        "OAuth 2.0 tokens stored in Supabase with Row Level Security enabled",
        "Service role key used server-side only (never exposed to browser)",
        "All Google Ads API calls authenticated with developer token + OAuth access token",
        "Automatic token refresh before expiry (5-minute buffer)",
        "No sensitive data in URL parameters",
    ]),
]:
    story.append(Paragraph(title, styles["SubHead"]))
    for b in bullets:
        story.append(Paragraph("  " + b, styles["Bul"]))

# Section 7
story.append(Paragraph("7. API Request Volume Estimates", styles["SectionHead"]))
story.append(make_table([
    ["Operation", "API Calls", "Frequency"],
    ["Campaign creation", "10-20 per campaign", "As needed"],
    ["Performance sync", "5-10 queries", "Every 6 hours"],
    ["Keyword research", "2-5 calls", "Per research session"],
    ["Bid/status updates", "1-5 calls", "As needed (via approval)"],
    ["Daily total estimate", "50-200 calls", "Single-user internal tool"],
    ["Peak usage", "Up to 500 calls", "Campaign creation bursts"],
], col_widths=[2.2*inch, 1.8*inch, 2.5*inch]))

# Section 8
story.append(Paragraph("8. Single User / Internal Tool", styles["SectionHead"]))
for b in [
    "This tool manages ONE Google Ads account (Customer ID: 768-735-1996)",
    "Used internally by ACI Infotech marketing team only",
    "Not a multi-tenant SaaS application",
    "No third-party access to the Google Ads account",
    "Manager Account (448-865-3547) used for API access and account oversight",
]:
    story.append(Paragraph("  " + b, styles["Bul"]))

# Section 9
story.append(Paragraph("9. Contact Information", styles["SectionHead"]))
story.append(make_table([
    ["Field", "Value"],
    ["Company", "ACI Infotech"],
    ["Developer Contact", "marketing@aciinfotech.net"],
    ["Website", "https://aciinfotech.com"],
    ["Manager Account", "448-865-3547"],
    ["Customer Account", "768-735-1996"],
]))

story.append(Spacer(1, 24))
story.append(HRFlowable(width="100%", thickness=0.5, color=HexColor("#cccccc")))
story.append(Spacer(1, 6))
story.append(Paragraph("ACI Ads Manager - Design Documentation v1.0 - April 2026 - ACI Infotech", styles["Foot"]))

doc.build(story)
print("PDF created: ACI-Ads-Manager-Design-Document.pdf")
