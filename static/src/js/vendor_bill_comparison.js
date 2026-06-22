/** @odoo-module **/

export function getVendorBillDomain(item, dateFrom, dateTo, vendorId = null) {
    const domain = [
        ["move_type", "=", "in_invoice"],
        ["state", "!=", "cancel"],
    ];

    if (item.variantIds && item.variantIds.length) {
        domain.push(["line_ids.product_id", "in", item.variantIds]);
    } else {
        domain.push(["id", "=", 0]);
    }

    if (dateFrom) {
        domain.push(["invoice_date", ">=", dateFrom]);
    }
    if (dateTo) {
        domain.push(["invoice_date", "<=", dateTo]);
    }
    if (vendorId) {
        domain.push(["partner_id", "=", vendorId]);
    }

    return domain;
}

export async function loadVendorBillComparison(orm, item, dateFrom, dateTo) {
    const billDomain = getVendorBillDomain(item, dateFrom, dateTo);
    const bills = await orm.searchRead(
        "account.move",
        billDomain,
        ["id", "partner_id", "invoice_date", "invoice_date_due"],
        { context: { active_test: false } }
    );

    const billIds = bills.map((bill) => bill.id);
    const billMap = new Map(bills.map((bill) => [bill.id, bill]));
    const lineDomain = billIds.length
        ? [
            ["move_id", "in", billIds],
            ["product_id", "in", item.variantIds || []],
            ["display_type", "=", "product"],
        ]
        : [["id", "=", 0]];

    const billLines = await orm.searchRead(
        "account.move.line",
        lineDomain,
        ["move_id", "product_id", "quantity", "price_subtotal", "partner_id"],
        { context: { active_test: false } }
    );

    const vendorMap = new Map();
    let totalCapacity = 0;
    let totalSpend = 0;
    const totalBillIds = new Set();

    for (const line of billLines) {
        const billId = line.move_id && line.move_id[0];
        const bill = billMap.get(billId);
        if (!bill) {
            continue;
        }

        const vendorId = bill.partner_id && bill.partner_id[0];
        const vendorName = bill.partner_id ? bill.partner_id[1] : "No Vendor";
        const vendorKey = vendorId || `no_vendor_${billId}`;
        const capacity = line.quantity || 0;
        const amount = line.price_subtotal || 0;
        const startDate = bill.invoice_date || null;
        const endDate = bill.invoice_date_due || bill.invoice_date || null;

        if (!vendorMap.has(vendorKey)) {
            vendorMap.set(vendorKey, {
                vendorId,
                vendorName,
                totalCapacity: 0,
                billAmount: 0,
                billIds: new Set(),
                startDate,
                endDate,
            });
        }

        const row = vendorMap.get(vendorKey);
        row.totalCapacity += capacity;
        row.billAmount += amount;
        row.billIds.add(billId);

        if (startDate && (!row.startDate || startDate < row.startDate)) {
            row.startDate = startDate;
        }
        if (endDate && (!row.endDate || endDate > row.endDate)) {
            row.endDate = endDate;
        }

        totalCapacity += capacity;
        totalSpend += amount;
        totalBillIds.add(billId);
    }

    const vendorRows = Array.from(vendorMap.values())
        .map((row) => ({
            ...row,
            purchaseCount: row.billIds.size,
            averagePrice: row.totalCapacity ? row.billAmount / row.totalCapacity : 0,
        }))
        .sort((a, b) => a.vendorName.localeCompare(b.vendorName));

    return {
        vendorRows,
        summary: {
            totalActiveCapacity: totalCapacity,
            totalCapacity,
            totalPurchases: totalBillIds.size,
            totalSpend,
            averagePrice: totalCapacity ? totalSpend / totalCapacity : 0,
        },
    };
}
