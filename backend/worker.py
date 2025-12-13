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
        # Page 2 (0-based index)
        page = pdf.pages[1]

        # --------------------------------------------------
        # TEXT EXTRACTION (FLAT TEXT)
        # --------------------------------------------------
        text = page.extract_text() or ""
        flat_text = " ".join(text.split())

        # --------------------------------------------------
        # 1. INVOICE NO & DATE
        # --------------------------------------------------
        inv_match = re.search(r"(EXP-\d+\s+\d{2}/\d{2}/\d{4})", flat_text)
        if inv_match:
            invoice_no_dt = inv_match.group(1)

        # --------------------------------------------------
        # 2. BUYER NAME & ADDRESS (STRICT CROP – RIGHT SIDE)
        # --------------------------------------------------
        w, h = page.width, page.height

        buyer_crop = page.crop((
            w * 0.48,   # right half
            h * 0.24,   # below headers
            w * 0.98,
            h * 0.34    # stop before valuation table
        ))

        buyer_text = buyer_crop.extract_text() or ""
        buyer_lines = []

        for line in buyer_text.splitlines():
            line = line.strip()
            if not line:
                continue

            # Skip headers only
            if "BUYER" in line.upper():
                continue
            if "AEO" in line.upper():
                continue

            # --- CLEAN EXTRACTION NOISE (SAFE) ---
            line = line.replace("OFPFICE", "OFFICE")
            line = re.sub(r"\bC$", "", line)     # trailing junk C
            line = re.sub(r"\s{2,}", " ", line)

            buyer_lines.append(line)

        buyer_address = " ".join(buyer_lines)

        # --------------------------------------------------
        # 3. TABLE EXTRACTION (INVOICE VALUE + EXCHANGE RATE)
        # --------------------------------------------------
        tables = page.extract_tables()

        for table in tables:
            for i, row in enumerate(table):
                if not row:
                    continue

                row_text = " ".join(cell or "" for cell in row).upper()

                # ---- INVOICE VALUE ----
                if "INVOICE VALUE" in row_text and i + 1 < len(table):
                    value_row = table[i + 1]
                    for cell in value_row:
                        if cell and re.fullmatch(r"\d+(\.\d+)?", cell.strip()):
                            invoice_value = cell.strip()
                            break

                # ---- EXCHANGE RATE ----
                for cell in row:
                    if cell and "EUR" in cell and "INR" in cell:
                        exchange_rate = cell.strip()

    return invoice_no_dt, buyer_address, invoice_value, exchange_rate


def write_excel(output_path, data):
    wb = Workbook()
    ws = wb.active
    ws.title = "Invoices"

    ws.append([
        "SN",
        "Invoice No & Dt",
        "Buyers Name & Address",
        "Invoice value",
        "Exchange Rate"
    ])

    ws.append([
        1,
        data[0],
        data[1],
        data[2],
        data[3]
    ])

    wb.save(output_path)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python worker.py <input.pdf> <output.xlsx>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_excel = sys.argv[2]

    data = extract_invoice_data(pdf_path)
    write_excel(output_excel, data)

    print("Invoice No & Dt:", data[0])
    print("Buyer:", data[1])
    print("Invoice Value:", data[2])
    print("Exchange Rate:", data[3])
