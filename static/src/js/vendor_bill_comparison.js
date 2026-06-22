/** @odoo-module **/

const ROW_VENDOR_SEPARATOR = "__kio_bill_row__";

function encodeRowVendorId(vendorId, billIds) {
    const vendorPart = vendorId || "no_vendor";
    return `${ROW_VENDOR_SEPARATOR}${vendorPart}${ROW_VENDOR_SEPARATOR}${billIds.join(",")}`;
}

function decodeRowVendorId(value) {
    if (typeof value !== "string" || !value.startsWith(ROW_VENDOR_SEPARATOR)) {
        return {
            vendorId: value,
            billIds: [],
        };
    }

    const parts = value.split(ROW_VENDOR_SEPARATOR).filter(Boolean);
    const vendorPart = parts[0];
    const billPart = parts[1] || "";

    return {
        vendorId: vendorPart === "no_vendor" ? null : Number(vendorPart),
        billIds: billPart
            .split(",")
            .filter(Boolean)
            .map((billId) => Number(billId)),
    };
}

function getLinePricePerMbps(capacity, billAmount) {
    return capacity ? billAmount / capacity : 0;
}

function getRowKey(vendorId, billId, startDate, endDate, pricePerMbps) {
    return [
        vendorId || "no_vendor",
        billId || "no_bill",
        startDate || "no_start",
        endDate || "no_end",
        pricePerMbps.toFixed(6),
    ].join("|");
}

export function getVendorBillDomain(item, dateFrom, dateTo, vendorId = null) {
    const decodedVendor = decodeRowVendorId(vendorId);
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
    if (decodedVendor.vendorId) {
        domain.push(["partner_id", "=", decodedVendor.vendorId]);
    }
    if (decodedVendor.billIds.length) {
        domain.push(["id", "in", decodedVendor.billIds]);
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
        ["id", "move_id", "product_id", "quantity", "price_subtotal", "partner_id"],
        { context: { active_test: false } }
    );

    const rowMap = new Map();
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
        const capacity = line.quantity || 0;
        const billAmount = line.price_subtotal || 0;
        const startDate = bill.invoice_date || null;
        const endDate = bill.invoice_date_due || bill.invoice_date || null;
        const pricePerMbps = getLinePricePerMbps(capacity, billAmount);
        const rowKey = getRowKey(vendorId, billId, startDate, endDate, pricePerMbps);

        if (!rowMap.has(rowKey)) {
            rowMap.set(rowKey, {
                vendorId: encodeRowVendorId(vendorId, [billId]),
                actualVendorId: vendorId,
                vendorName,
                totalCapacity: 0,
                billAmount: 0,
                billIds: new Set(),
                lineIds: new Set(),
                startDate,
                endDate,
                averagePrice: pricePerMbps,
            });
        }

        const row = rowMap.get(rowKey);
        row.totalCapacity += capacity;
        row.billAmount += billAmount;
        row.billIds.add(billId);
        row.lineIds.add(line.id);

        totalCapacity += capacity;
        totalSpend += billAmount;
        totalBillIds.add(billId);
    }

    const vendorRows = Array.from(rowMap.values())
        .map((row) => {
            const billIdsForRow = Array.from(row.billIds);
            return {
                ...row,
                vendorId: encodeRowVendorId(row.actualVendorId, billIdsForRow),
                purchaseCount: billIdsForRow.length,
                averagePrice: row.totalCapacity ? row.billAmount / row.totalCapacity : row.averagePrice,
            };
        })
        .sort((a, b) => {
            const vendorCompare = a.vendorName.localeCompare(b.vendorName);
            if (vendorCompare) {
                return vendorCompare;
            }
            if ((a.startDate || "") !== (b.startDate || "")) {
                return (a.startDate || "").localeCompare(b.startDate || "");
            }
            if ((a.endDate || "") !== (b.endDate || "")) {
                return (a.endDate || "").localeCompare(b.endDate || "");
            }
            return a.averagePrice - b.averagePrice;
        });

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
