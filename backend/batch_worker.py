import sys
import os
from openpyxl import Workbook, load_workbook

# --------------------------------------------------
# IMPORT YOUR EXISTING EXTRACTION FUNCTION
# --------------------------------------------------
from worker import extract_invoice_data  
# extract_invoice_data(pdf_path) -> dict

# --------------------------------------------------
# Arguments
# --------------------------------------------------
if len(sys.argv) < 3:
    print("Usage: python batch_worker.py output.xlsx pdf1.pdf pdf2.pdf ...")
    sys.exit(1)

output_excel = sys.argv[1]
pdf_files = sys.argv[2:]

# --------------------------------------------------
# Create or load Excel
# --------------------------------------------------
if os.path.exists(output_excel):
    wb = load_workbook(output_excel)
    ws = wb.active
else:
    wb = Workbook()
    ws = wb.active

    # HEADER ROW (WRITE ONCE)
    ws.append([
        "Invoice No & Date",
        "Buyer Name & Address",
        "Invoice Value",
        "Exchange Rate"
    ])

# --------------------------------------------------
# Process each PDF
# --------------------------------------------------
for pdf_path in pdf_files:
    try:
        print(f"Processing: {pdf_path}")

        data = extract_invoice_data(pdf_path)

        ws.append([
            data.get("invoice_no_date", ""),
            data.get("buyer", ""),
            data.get("invoice_value", ""),
            data.get("exchange_rate", ""),
        ])

    except Exception as e:
        print(f"ERROR processing {pdf_path}: {e}")

# --------------------------------------------------
# Save Excel
# --------------------------------------------------
wb.save(output_excel)

print(f"Batch Excel created: {output_excel}")
