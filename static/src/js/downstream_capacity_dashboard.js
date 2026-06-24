/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, onWillStart, useState } from "@odoo/owl";

export class DownstreamCapacityDashboard extends Component {
    setup() {
        this.orm = useService("orm");
        this.action = useService("action");

        const currentMonthRange = this.getCurrentMonthRange();

        this.state = useState({
            loading: true,
            detailLoading: false,
            dateFrom: currentMonthRange.dateFrom,
            dateTo: currentMonthRange.dateTo,
            summary: {
                totalActiveCustomers: 0,
                totalAllocatedCapacity: 0,
                totalPackages: 0,
                totalMonthlyRevenue: 0,
            },
            packages: [],
            selectedPackage: null,
        });

        onWillStart(async () => {
            await this.loadDashboardData();
        });
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

    getInitials(name) {
        return (name || "?").trim().slice(0, 1).toUpperCase();
    }

    getProductPackage(product, variantIds = []) {
        return {
            packageId: product.id,
            packageName: product.name,
            active: product.active,
            variantIds,
            customerCount: 0,
            allocatedCapacity: 0,
            averageCapacity: 0,
            monthlyRevenue: 0,
            customerMap: new Map(),
            customers: [],
        };
    }

    getCustomerInvoiceDomain() {
        const domain = [
            ["move_type", "=", "out_invoice"],
            ["state", "!=", "cancel"],
        ];
        if (this.state.dateFrom) {
            domain.push(["invoice_date", ">=", this.state.dateFrom]);
        }
        if (this.state.dateTo) {
            domain.push(["invoice_date", "<=", this.state.dateTo]);
        }
        return domain;
    }

    getInvoiceLineDomain(invoiceIds, variantIds) {
        if (!invoiceIds.length || !variantIds.length) {
            return [["id", "=", 0]];
        }
        return [
            ["move_id", "in", invoiceIds],
            ["product_id", "in", variantIds],
        ];
    }

    addInvoiceLineToPackage(packageRow, line, invoiceMap) {
        const quantity = line.quantity || 0;
        const amount = line.price_subtotal || 0;
        const invoiceId = line.move_id && line.move_id[0];
        const invoice = invoiceMap.get(invoiceId);
        const partnerId = invoice && invoice.partner_id && invoice.partner_id[0];
        const partnerName = invoice && invoice.partner_id ? invoice.partner_id[1] : "No Customer";
        const customerKey = partnerId || `no_customer_${partnerName}`;

        packageRow.allocatedCapacity += quantity;
        packageRow.monthlyRevenue += amount;

        if (!packageRow.customerMap.has(customerKey)) {
            packageRow.customerMap.set(customerKey, {
                id: partnerId || customerKey,
                partnerId,
                name: partnerName,
                package: packageRow.packageName,
                allocatedCapacity: 0,
                currentUsage: 0,
                remainingCapacity: 0,
                monthlyBill: 0,
                status: "Active",
                invoiceIds: [],
            });
        }

        const customer = packageRow.customerMap.get(customerKey);
        customer.allocatedCapacity += quantity;
        customer.remainingCapacity += quantity;
        customer.monthlyBill += amount;
        if (invoiceId && !customer.invoiceIds.includes(invoiceId)) {
            customer.invoiceIds.push(invoiceId);
        }
    }

    finalizePackage(packageRow) {
        const customers = Array.from(packageRow.customerMap.values()).sort((a, b) =>
            a.name.localeCompare(b.name)
        );
        packageRow.customerCount = customers.length;
        packageRow.averageCapacity = packageRow.customerCount
            ? packageRow.allocatedCapacity / packageRow.customerCount
            : 0;
        packageRow.customers = customers;
        delete packageRow.customerMap;
        return packageRow;
    }

    getPackageSummary(packages) {
        return packages.reduce(
            (summary, packageRow) => {
                summary.totalActiveCustomers += packageRow.customerCount || 0;
                summary.totalAllocatedCapacity += packageRow.allocatedCapacity || 0;
                summary.totalMonthlyRevenue += packageRow.monthlyRevenue || 0;
                return summary;
            },
            {
                totalActiveCustomers: 0,
                totalAllocatedCapacity: 0,
                totalPackages: packages.length,
                totalMonthlyRevenue: 0,
            }
        );
    }

    async loadDashboardData() {
        this.state.loading = true;

        try {
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

            const allVariantIds = productVariants.map((variant) => variant.id);
            const invoices = await this.orm.searchRead(
                "account.move",
                this.getCustomerInvoiceDomain(),
                ["id", "partner_id", "invoice_date", "invoice_date_due"],
                { context: { active_test: false } }
            );
            const invoiceIds = invoices.map((invoice) => invoice.id);
            const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));
            const invoiceLines = await this.orm.searchRead(
                "account.move.line",
                this.getInvoiceLineDomain(invoiceIds, allVariantIds),
                ["id", "move_id", "product_id", "quantity", "price_subtotal"],
                { context: { active_test: false } }
            );

            const packageMap = new Map();
            for (const product of serviceProducts) {
                packageMap.set(product.id, this.getProductPackage(
                    product,
                    templateToVariants.get(product.id) || []
                ));
            }

            for (const line of invoiceLines) {
                const variantId = line.product_id && line.product_id[0];
                const templateId = variantToTemplate.get(variantId);
                const packageRow = packageMap.get(templateId);
                if (!packageRow) {
                    continue;
                }
                this.addInvoiceLineToPackage(packageRow, line, invoiceMap);
            }

            const packages = Array.from(packageMap.values())
                .map((packageRow) => this.finalizePackage(packageRow))
                .sort((a, b) => a.packageName.localeCompare(b.packageName));

            this.state.packages = packages;
            this.state.summary = this.getPackageSummary(packages);
            if (this.state.selectedPackage) {
                this.state.selectedPackage = packages.find(
                    (packageRow) => packageRow.packageId === this.state.selectedPackage.packageId
                ) || null;
            }
        } catch (error) {
            console.error("Downstream Capacity Dashboard Load Error:", error);
            this.state.packages = [];
            this.state.summary = this.getPackageSummary([]);
        } finally {
            this.state.loading = false;
        }
    }

    async onDateRangeChange(field, value) {
        this.state[field] = value;
        await this.loadDashboardData();
    }

    async clearDateRange() {
        const currentMonthRange = this.getCurrentMonthRange();
        this.state.dateFrom = currentMonthRange.dateFrom;
        this.state.dateTo = currentMonthRange.dateTo;
        await this.loadDashboardData();
    }

    openPackage(packageRow) {
        this.state.selectedPackage = packageRow;
    }

    backToDashboard() {
        this.state.selectedPackage = null;
    }

    backToOverview() {
        this.action.doAction("kio_capacity_analysis.action_kio_capacity_dashboard");
    }

    openCustomerDetails(customer) {
        if (customer.invoiceIds && customer.invoiceIds.length) {
            this.action.doAction({
                type: "ir.actions.act_window",
                name: `${customer.name} Customer Invoices`,
                res_model: "account.move",
                views: [
                    [false, "tree"],
                    [false, "form"],
                ],
                domain: [["id", "in", customer.invoiceIds]],
                context: { active_test: false },
                target: "current",
            });
            return;
        }
        if (!customer.partnerId) {
            return;
        }
        this.action.doAction({
            type: "ir.actions.act_window",
            name: customer.name,
            res_model: "res.partner",
            res_id: customer.partnerId,
            views: [[false, "form"]],
            target: "current",
        });
    }
}

DownstreamCapacityDashboard.template = "kio_capacity_analysis.DownstreamCapacityDashboard";

registry
    .category("actions")
    .add("kio_capacity_analysis.downstream_capacity_dashboard", DownstreamCapacityDashboard);
