import { jsPDF } from "jspdf";

function formatCurrency(v) {
  if (v === null || v === undefined) return "-";
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return `KSh ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function generateQuotationPDF({ calculationId, customerName, product, input, results }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  let y = 50;

  // Header
  doc.setFontSize(18);
  doc.text("Kenindia Assurance Company Limited", margin, y);
  doc.setFontSize(10);
  doc.text("Kenindia House, Loita Street, Nairobi | Tel: +254 20 222 0000 | info@kenindia.com", margin, y + 18);
  y += 40;

  // Title
  doc.setFontSize(14);
  doc.text("LIFE INSURANCE QUOTATION", margin, y);
  doc.setFontSize(10);
  const issued = new Date().toLocaleDateString();
  doc.text(`Issued on: ${issued}`, 500, y);
  y += 26;

  // Customer / policy info
  doc.setFontSize(11);
  doc.text(`Customer: ${customerName || "(Not provided)"}`, margin, y);
  doc.text(`Product: ${String(product || "-").replaceAll("_", " ")}`, 350, y);
  y += 18;
  doc.text(`DOB: ${input?.dob || "-"}`, margin, y);
  doc.text(`Age next birthday: ${input?.ageNextBirthday ?? "-"}`, 200, y);
  doc.text(`Gender: ${input?.gender || "-"}`, 350, y);
  doc.text(`Term: ${input?.term || "-"}`, 450, y);
  y += 24;

  // Divider
  doc.setLineWidth(0.5);
  doc.line(margin, y, 560, y);
  y += 12;

  // Premium breakdown
  doc.setFontSize(12);
  doc.text("Premium Breakdown", margin, y);
  y += 16;

  const rows = [];
  const addRow = (label, value) => rows.push({ label, value });

  // Fill typical fields; `results` shape varies by product so we defensively access keys
  addRow("Sum Assured", formatCurrency(results?.estimated_sum_assured ?? input?.sumAssured));
  addRow("Basic Premium", formatCurrency(results?.basic_premium ?? results?.premium ?? 0));
  if (results?.dab) addRow("Double Accident Benefit (DAB)", formatCurrency(results.dab));
  if (results?.wp) addRow("Waiver of Premium (WP)", formatCurrency(results.wp));
  if (results?.accrued_bonus) addRow("Accrued Bonus", formatCurrency(results.accrued_bonus));
  addRow("Total Premium", formatCurrency(results?.total_premium ?? results?.premium ?? 0));

  // Render rows
  doc.setFontSize(10);
  rows.forEach((r) => {
    doc.text(r.label, margin, y);
    doc.text(String(r.value), 450, y, { align: "right" });
    y += 16;
    if (y > 740) {
      doc.addPage();
      y = 50;
    }
  });

  y += 10;
  doc.setLineWidth(0.5);
  doc.line(margin, y, 560, y);
  y += 18;

  // Benefits (if present)
  if (results?.benefits && typeof results.benefits === "object") {
    doc.setFontSize(12);
    doc.text("Benefits", margin, y);
    y += 14;
    doc.setFontSize(10);
    Object.entries(results.benefits).forEach(([k, v]) => {
      const label = String(k).replaceAll("_", " ");
      doc.text(label + ":", margin, y);
      doc.text(formatCurrency(v), 450, y, { align: "right" });
      y += 14;
      if (y > 740) {
        doc.addPage();
        y = 50;
      }
    });
  }

  // Footer / disclaimer
  if (y > 650) {
    doc.addPage();
    y = 50;
  }
  y = 760;
  doc.setFontSize(9);
  doc.text(
    "This quotation is indicative and subject to terms and underwriting. For official confirmation contact Kenindia Assurance.",
    margin,
    y
  );

  const filename = `quotation_${calculationId || "result"}.pdf`;
  doc.save(filename);
}
