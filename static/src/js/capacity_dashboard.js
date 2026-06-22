/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, onWillStart, useState } from "@odoo/owl";

export class KioCapacityDashboard extends Component {
    setup() {
        this.orm = useService("orm");
        this.action = useService("action");

        const currentMonthRange = this.getCurrentMonthRange();

        this.state = useState({
            loading: true,
            summary: {
                totalActiveCapacity: 0,
                totalSpend: 0,
                totalCapacityItems: 0,
            },
            capacityItems: [],
            dateFrom: currentMonthRange.dateFrom,
            dateTo: currentMonthRange.dateTo,
            selectedItem: null,
            comparisonLoading: false,
            vendorRows: [],
            comparisonSummary: {
                totalActiveCapacity: 0,
                totalCapacity: 0,
                totalPurchases: 0,
                totalSpend: 0,
                averagePrice: 0,
            },
        });

        onWillStart(async () => {
            await this.loadDashboardData();
        });
    }

    async loadDashboardData() {
        this.state.loading = true;

        try {
            const invoiceLineDomain = [
                ["move_id.move_type", "=", "in_invoice"],
                ["move_id.state", "!=", "cancel"],
                ["display_type", "=", "product"],
            ];
            if (this.state.dateFrom) {
                invoiceLineDomain.push(["move_id.invoice_date", ">=", this.state.dateFrom]);
            }
            if (this.state.dateTo) {
                invoiceLineDomain.push(["move_id.invoice_date", "<=", this.state.dateTo]);
            }

            const serviceProducts = await this.orm.searchRead(
                "product.template",
                [
                    ["detailed_type", "=", "service"],
                    ["is_upstream_service", "=", true],
                ],
                ["id", "name", "active", "is_upstream_service"],
                { context: { active_test: false } }
            );

            const templateIds = serviceProducts.map((product) => product.id);
            const productVariants = templateIds.length
                ? await this.orm.searchRead(
                    "product.product",
                    [["product_tmpl_id", "in", templateIds]],
                    ["id", "product_tmpl_id"],
                    { context: { active_test: false } }
                )
                : [];

            const variantToTemplate = new Map();
            const templateToVariants = new Map();
            for (const variant of productVariants) {
                const templateId = variant.product_tmpl_id && variant.product_tmpl_id[0];
                if (!templateId) {
                    continue;
                }
                variantToTemplate.set(variant.id, templateId);
                if (!templateToVariants.has(templateId)) {
                    templateToVariants.set(templateId, []);
                }
                templateToVariants.get(templateId).push(variant.id);
            }

            const variantIds = productVariants.map((variant) => variant.id);
            if (variantIds.length) {
                invoiceLineDomain.push(["product_id", "in", variantIds]);
            } else {
                invoiceLineDomain.push(["id", "=", 0]);
            }

            const invoiceLines = await this.orm.searchRead(
                "account.move.line",
                invoiceLineDomain,
                [
                    "product_id",
                    "quantity",
                    "price_subtotal",
                    "move_id",
                    "partner_id",
                ],
                { context: { active_test: false } }
            );

            const itemMap = new Map();
            let totalSalesQuantity = 0;
            let totalInvoiceAmount = 0;

            for (const product of serviceProducts) {
                itemMap.set(product.id, {
                    itemId: product.id,
                    itemName: product.name,
                    active: product.active,
                    variantIds: templateToVariants.get(product.id) || [],
                    totalCapacity: 0,
                    totalPrice: 0,
                    purchaseCount: 0,
                });
            }

            for (const line of invoiceLines) {
                const variantId = line.product_id && line.product_id[0];
                const templateId = variantToTemplate.get(variantId);
                const item = itemMap.get(templateId);
                if (!item) {
                    continue;
                }

                const quantity = line.quantity || 0;
                const amount = line.price_subtotal || 0;

                item.totalCapacity += quantity;
                item.totalPrice += amount;
                item.purchaseCount += 1;
                totalSalesQuantity += quantity;
                totalInvoiceAmount += amount;
            }

            this.state.summary = {
                totalActiveCapacity: totalSalesQuantity,
                totalSpend: totalInvoiceAmount,
                totalCapacityItems: serviceProducts.length,
            };

            this.state.capacityItems = Array.from(itemMap.values()).sort((a, b) =>
                a.itemName.localeCompare(b.itemName)
            );
        } catch (error) {
            console.error("Dashboard Load Error:", error);
            this.state.capacityItems = [];
        } finally {
            this.state.loading = false;
        }
    }

    getCurrentMonthRange() {
        const today = new Date();
        const formatDate = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        };

        return {
            dateFrom: formatDate(new Date(today.getFullYear(), today.getMonth(), 1)),
            dateTo: formatDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
        };
    }

    formatNumber(value) {
        return (value || 0).toLocaleString(undefined, {
            maximumFractionDigits: 2,
        });
    }

    async onDateRangeChange(field, value) {
        this.state[field] = value;
        if (this.state.selectedItem) {
            await this.loadVendorComparisonData();
        } else {
            await this.loadDashboardData();
        }
    }

    async clearDateRange() {
        const currentMonthRange = this.getCurrentMonthRange();
        this.state.dateFrom = currentMonthRange.dateFrom;
        this.state.dateTo = currentMonthRange.dateTo;
        if (this.state.selectedItem) {
            await this.loadVendorComparisonData();
        } else {
            await this.loadDashboardData();
        }
    }

    getInvoiceLineDomain(item) {
        const domain = [
            ["move_id.move_type", "=", "in_invoice"],
            ["move_id.state", "!=", "cancel"],
            ["display_type", "=", "product"],
        ];
        if (item.variantIds && item.variantIds.length) {
            domain.push(["product_id", "in", item.variantIds]);
        } else {
            domain.push(["id", "=", 0]);
        }
        if (this.state.dateFrom) {
            domain.push(["move_id.invoice_date", ">=", this.state.dateFrom]);
        }
        if (this.state.dateTo) {
            domain.push(["move_id.invoice_date", "<=", this.state.dateTo]);
        }
        return domain;
    }

    getPurchaseDateDomain() {
        const domain = [];
        if (this.state.dateFrom) {
            domain.push(["purchase_date", ">=", this.state.dateFrom]);
        }
        if (this.state.dateTo) {
            domain.push(["purchase_date", "<=", this.state.dateTo]);
        }
        return domain;
    }

    getSelectedItemPurchaseDomain(vendorId = null) {
        const domain = [
            ["line_ids.capacity_item_id.name", "=", this.state.selectedItem.itemName],
            ...this.getPurchaseDateDomain(),
        ];
        if (vendorId) {
            domain.push(["provider_id", "=", vendorId]);
        }
        return domain;
    }

    getDisplayDate(value) {
        return value || "-";
    }

    getVendorAveragePrice(row) {
        return row.totalCapacity ? row.billAmount / row.totalCapacity : 0;
    }

    async openCapacityItemPurchases(item) {
        this.state.selectedItem = item;
        await this.loadVendorComparisonData();
    }

    backToDashboard() {
        this.state.selectedItem = null;
        this.state.vendorRows = [];
        this.state.comparisonSummary = {
            totalActiveCapacity: 0,
            totalCapacity: 0,
            totalPurchases: 0,
            totalSpend: 0,
            averagePrice: 0,
        };
    }

    async loadVendorComparisonData() {
        if (!this.state.selectedItem) {
            return;
        }

        this.state.comparisonLoading = true;

        try {
            const purchases = await this.orm.searchRead(
                "kio.capacity.upstream.purchase",
                this.getSelectedItemPurchaseDomain(),
                [
                    "id",
                    "active",
                    "provider_id",
                    "purchase_date",
                    "contract_start_date",
                    "contract_end_date",
                ],
                { context: { active_test: false } }
            );

            const purchaseIds = purchases.map((purchase) => purchase.id);
            const purchaseMap = new Map(purchases.map((purchase) => [purchase.id, purchase]));
            const lineDomain = purchaseIds.length
                ? [
                    ["purchase_id", "in", purchaseIds],
                    ["capacity_item_id.name", "=", this.state.selectedItem.itemName],
                ]
                : [["id", "=", 0]];

            const purchaseLines = await this.orm.searchRead(
                "kio.capacity.upstream.purchase.line",
                lineDomain,
                ["purchase_id", "purchased_capacity", "price", "total_price"],
                { context: { active_test: false } }
            );

            const vendorMap = new Map();
            let totalActiveCapacity = 0;
            let totalCapacity = 0;
            let totalSpend = 0;
            const totalPurchaseIds = new Set();

            for (const line of purchaseLines) {
                const purchaseId = line.purchase_id && line.purchase_id[0];
                const purchase = purchaseMap.get(purchaseId);
                if (!purchase) {
                    continue;
                }

                const providerId = purchase.provider_id && purchase.provider_id[0];
                const providerName = purchase.provider_id ? purchase.provider_id[1] : "No Vendor";
                const vendorKey = providerId || `no_vendor_${purchaseId}`;
                const capacity = line.purchased_capacity || 0;
                const amount = line.total_price || 0;

                if (!vendorMap.has(vendorKey)) {
                    vendorMap.set(vendorKey, {
                        vendorId: providerId,
                        vendorName: providerName,
                        totalCapacity: 0,
                        billAmount: 0,
                        purchaseIds: new Set(),
                        startDate: purchase.contract_start_date || purchase.purchase_date || null,
                        endDate: purchase.contract_end_date || purchase.purchase_date || null,
                    });
                }

                const row = vendorMap.get(vendorKey);
                row.totalCapacity += capacity;
                row.billAmount += amount;
                row.purchaseIds.add(purchaseId);

                const startDate = purchase.contract_start_date || purchase.purchase_date;
                const endDate = purchase.contract_end_date || purchase.purchase_date;
                if (startDate && (!row.startDate || startDate < row.startDate)) {
                    row.startDate = startDate;
                }
                if (endDate && (!row.endDate || endDate > row.endDate)) {
                    row.endDate = endDate;
                }

                totalCapacity += capacity;
                if (purchase.active) {
                    totalActiveCapacity += capacity;
                }
                totalSpend += amount;
                totalPurchaseIds.add(purchaseId);
            }

            const vendorRows = Array.from(vendorMap.values())
                .map((row) => ({
                    ...row,
                    purchaseCount: row.purchaseIds.size,
                    averagePrice: this.getVendorAveragePrice(row),
                }))
                .sort((a, b) => a.vendorName.localeCompare(b.vendorName));

            this.state.vendorRows = vendorRows;
            this.state.comparisonSummary = {
                totalActiveCapacity,
                totalCapacity,
                totalPurchases: totalPurchaseIds.size,
                totalSpend,
                averagePrice: totalCapacity ? totalSpend / totalCapacity : 0,
            };
        } catch (error) {
            console.error("Vendor Comparison Load Error:", error);
            this.state.vendorRows = [];
            this.state.comparisonSummary = {
                totalActiveCapacity: 0,
                totalCapacity: 0,
                totalPurchases: 0,
                totalSpend: 0,
                averagePrice: 0,
            };
        } finally {
            this.state.comparisonLoading = false;
        }
    }

    openVendorPurchases(row) {
        this.action.doAction({
            type: "ir.actions.act_window",
            name: `${this.state.selectedItem.itemName} - ${row.vendorName} Purchases`,
            res_model: "kio.capacity.upstream.purchase",
            views: [
                [false, "tree"],
                [false, "form"],
            ],
            domain: this.getSelectedItemPurchaseDomain(row.vendorId),
            context: { active_test: false },
            target: "current",
        });
    }

    openCapacityItemForm() {
        this.action.doAction({
            type: "ir.actions.act_window",
            name: "Create Upstream Service Product",
            res_model: "product.template",
            views: [[false, "form"]],
            context: {
                default_detailed_type: "service",
                default_is_upstream_service: true,
            },
            target: "current",
        });
    }
}

KioCapacityDashboard.template = "kio_capacity_analysis.CapacityDashboard";

registry
    .category("actions")
    .add("kio_capacity_analysis.capacity_dashboard", KioCapacityDashboard);