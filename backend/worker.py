import sys
import re
import pdfplumber
from openpyxl import Workbook


def extract_invoice_data(pdf_path):
    invoice_no_dt = ""
    buyer_address = ""
    invoice_value = ""
    exchange_rate = ""

    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[1]

        text = page.extract_text() or ""
        flat_text = " ".join(text.split())

        # --------------------------------------------------
        # 1. INVOICE NO & DATE
        # --------------------------------------------------
        m = re.search(r"(EXP-\d+\s+\d{2}/\d{2}/\d{4})", flat_text)
        if m:
            invoice_no_dt = m.group(1)

        # --------------------------------------------------
        # 2. BUYER NAME & ADDRESS (UNCHANGED)
        # --------------------------------------------------
        w, h = page.width, page.height
        buyer_crop = page.crop((
            w * 0.48,
            h * 0.24,
            w * 0.98,
            h * 0.34
        ))

        buyer_text = buyer_crop.extract_text() or ""
        buyer_lines = []

        for line in buyer_text.splitlines():
            line = line.strip()
            if not line:
                continue
            if "BUYER" in line.upper():
                continue
            if "AEO" in line.upper():
                continue

            line = line.replace("OFPFICE", "OFFICE")
            line = re.sub(r"\bC$", "", line)
            line = re.sub(r"\s{2,}", " ", line)

            buyer_lines.append(line)

        buyer_address = " ".join(buyer_lines)

        # --------------------------------------------------
        # 3. INVOICE VALUE (TABLE BASED)
        # --------------------------------------------------
        tables = page.extract_tables()
        for table in tables:
            for i, row in enumerate(table):
                if not row:
                    continue

                row_text = " ".join(cell or "" for cell in row).upper()

                if "INVOICE VALUE" in row_text and i + 1 < len(table):
                    value_row = table[i + 1]
                    for cell in value_row:
                        if cell and re.fullmatch(r"\d+(\.\d+)?", cell.strip()):
                            invoice_value = cell.strip()
                            break

        # --------------------------------------------------
        # 4. EXCHANGE RATE (TABLE + TEXT HYBRID — FIXED)
        # --------------------------------------------------
        # First try TABLE (most reliable)
        for table in tables:
            for row in table:
                if not row:
                    continue

                row_text = " ".join(cell or "" for cell in row).upper()

                if "EXCHANGE RATE" in row_text or "INR" in row_text:
                    # Match USD / EUR in any form
                    m = re.search(
                        r"(1\s*(USD|EUR)\s*INR\s*\d+(\.\d+)?)",
                        row_text
                    )
                    if m:
                        exchange_rate = m.group(1)
                        break

        # Fallback: TEXT SEARCH (for broken tables)
        if not exchange_rate:
            m = re.search(
                r"(1\s*(USD|EUR)\s*INR\s*\d+(\.\d+)?)",
                flat_text,
                re.IGNORECASE
            )
            if m:
                exchange_rate = m.group(1)

    return invoice_no_dt, buyer_address, invoice_value, exchange_rate


def write_excel(output_path, data):
    wb = Workbook()
    ws = wb.active
    ws.title = "Invoices"

    ws.append([
        "Invoice No & Date",
        "Buyer Name & Address",
        "Invoice Value",
        "Exchange Rate"
    ])

    ws.append([
        data[0],
        data[1],
        data[2],
        data[3]
    ])

    wb.save(output_path)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_excel = sys.argv[2]

    data = extract_invoice_data(pdf_path)
    write_excel(output_excel, data)
