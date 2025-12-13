import os
from openpyxl import Workbook
from worker import extract_invoice_data


UPLOAD_DIR = "uploads"
OUTPUT_EXCEL = "results/invoices.xlsx"


def run_batch():
    wb = Workbook()
    ws = wb.active
    ws.title = "Invoices"

    # Header (written ONCE)
    ws.append([
        "SN",
        "Invoice No & Dt",
        "Buyers Name & Address",
        "Invoice value",
        "Exchange Rate",
        "Source File"
    ])

    sn = 1

    for filename in sorted(os.listdir(UPLOAD_DIR)):
        if not filename.lower().endswith(".pdf"):
            continue

        pdf_path = os.path.join(UPLOAD_DIR, filename)
        print(f"Processing: {filename}")

        try:
            invoice_no_dt, buyer, value, rate = extract_invoice_data(pdf_path)

            ws.append([
                sn,
                invoice_no_dt,
                buyer,
                value,
                rate,
                filename
            ])

            sn += 1

        except Exception as e:
            print(f"❌ Failed: {filename} | {e}")

    wb.save(OUTPUT_EXCEL)
    print(f"\n✅ DONE — Excel created at: {OUTPUT_EXCEL}")


if __name__ == "__main__":
    run_batch()
