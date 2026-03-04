import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface LedgerRow {
  created_at: string;
  entry_type: string;
  category: string;
  amount: number;
  description: string;
}

interface ClientInfo {
  name: string;
  business_name?: string | null;
  tax_id?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
}

interface BalanceInfo {
  totalCredito: number;
  totalDebito: number;
  saldo: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  deposito_verificado: 'Deposito',
  entrega: 'Entrega',
  comision: 'Comision',
  ajuste_credito: 'Ajuste Credito',
  ajuste_debito: 'Ajuste Debito',
  reversa: 'Reversa',
};

export function generateClientStatement(
  client: ClientInfo,
  entries: LedgerRow[],
  balance: BalanceInfo,
  companyName = 'Gestion Integral'
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const today = format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es });

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(companyName, 14, 20);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text('Estado de Cuenta', 14, 28);
  doc.text(`Emitido: ${today}`, pageWidth - 14, 20, { align: 'right' });

  // Line
  doc.setDrawColor(200);
  doc.line(14, 32, pageWidth - 14, 32);

  // Client info
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(client.name, 14, 42);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  let yPos = 48;
  if (client.business_name) {
    doc.text(`Razon Social: ${client.business_name}`, 14, yPos);
    yPos += 5;
  }
  if (client.tax_id) {
    doc.text(`CUIT: ${client.tax_id}`, 14, yPos);
    yPos += 5;
  }
  if (client.contact_email) {
    doc.text(`Email: ${client.contact_email}`, 14, yPos);
    yPos += 5;
  }
  if (client.contact_phone) {
    doc.text(`Telefono: ${client.contact_phone}`, 14, yPos);
    yPos += 5;
  }

  yPos += 5;

  // Balance summary box
  doc.setFillColor(245, 245, 250);
  doc.roundedRect(14, yPos, pageWidth - 28, 20, 2, 2, 'F');

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text('Total Credito', 24, yPos + 8);
  doc.text('Total Debito', pageWidth / 2 - 20, yPos + 8);
  doc.text('Saldo', pageWidth - 50, yPos + 8);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(34, 139, 34); // green
  doc.text(formatAmount(balance.totalCredito), 24, yPos + 15);
  doc.setTextColor(220, 50, 50); // red
  doc.text(formatAmount(balance.totalDebito), pageWidth / 2 - 20, yPos + 15);
  doc.setTextColor(balance.saldo >= 0 ? 34 : 220, balance.saldo >= 0 ? 139 : 50, balance.saldo >= 0 ? 34 : 50);
  doc.text(formatAmount(balance.saldo), pageWidth - 50, yPos + 15);

  yPos += 28;

  // Movements table
  if (entries.length > 0) {
    let runningBalance = 0;
    const rows = entries.map((e) => {
      if (e.entry_type === 'credito') {
        runningBalance += e.amount;
      } else {
        runningBalance -= e.amount;
      }
      return [
        format(new Date(e.created_at), 'dd/MM/yyyy'),
        e.entry_type === 'credito' ? 'Credito' : 'Debito',
        CATEGORY_LABELS[e.category] || e.category,
        e.description.length > 40 ? e.description.substring(0, 37) + '...' : e.description,
        e.entry_type === 'credito' ? formatAmount(e.amount) : '',
        e.entry_type === 'debito' ? formatAmount(e.amount) : '',
        formatAmount(runningBalance),
      ];
    });

    autoTable(doc, {
      startY: yPos,
      head: [['Fecha', 'Tipo', 'Categoria', 'Descripcion', 'Credito', 'Debito', 'Saldo']],
      body: rows,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 2,
        textColor: [40, 40, 40],
      },
      headStyles: {
        fillColor: [50, 60, 80],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 16 },
        2: { cellWidth: 22 },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 22, halign: 'right' },
        6: { cellWidth: 22, halign: 'right' },
      },
      alternateRowStyles: {
        fillColor: [248, 248, 252],
      },
    });
  } else {
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text('No hay movimientos registrados.', 14, yPos + 10);
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Generado automaticamente por ${companyName} — Pagina ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  // Save
  const filename = `estado_cuenta_${client.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`;
  doc.save(filename);
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function generateLedgerPDF(
  entries: LedgerRow[],
  filters: { clientName?: string; dateFrom?: string; dateTo?: string },
  companyName = 'Gestion Integral'
) {
  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.getWidth();
  const today = format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es });

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`${companyName} — Cuenta Corriente`, 14, 18);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  let filterText = 'Todos los movimientos';
  if (filters.clientName) filterText = `Cliente: ${filters.clientName}`;
  if (filters.dateFrom || filters.dateTo) {
    filterText += ` | ${filters.dateFrom || '...'} a ${filters.dateTo || '...'}`;
  }
  doc.text(filterText, 14, 25);
  doc.text(`Emitido: ${today}`, pageWidth - 14, 18, { align: 'right' });

  const rows = entries.map((e) => [
    format(new Date(e.created_at), 'dd/MM/yyyy HH:mm'),
    e.entry_type === 'credito' ? 'Credito' : 'Debito',
    CATEGORY_LABELS[e.category] || e.category,
    e.description,
    formatAmount(e.amount),
  ]);

  autoTable(doc, {
    startY: 30,
    head: [['Fecha', 'Tipo', 'Categoria', 'Descripcion', 'Monto']],
    body: rows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [50, 60, 80], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      4: { halign: 'right' },
    },
  });

  const filename = `cuenta_corriente_${format(new Date(), 'yyyyMMdd')}.pdf`;
  doc.save(filename);
}
