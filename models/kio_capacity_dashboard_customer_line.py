# -*- coding: utf-8 -*-

from odoo import fields, models


class KioCapacityDashboardCustomerLine(models.Model):
    _name = "kio.capacity.dashboard.customer.line"
    _description = "KIO Capacity Dashboard Customer Line"

    customer_dashboard_id = fields.Many2one(
        "kio.capacity.dashboard.customer",
        string="Customer Capacity",
        required=True,
        ondelete="cascade",
    )

    type_id = fields.Many2one(
        "isp.capacity.type",
        string="Type",
    )

    capacity = fields.Float(string="MBPS", default=0.0)
    buffer_bandwidth = fields.Float(string="Buffer", default=0.0)
    offer_price = fields.Float(string="Offer Price", default=0.0)
    offer_total_price = fields.Float(string="Total Offer Price", default=0.0)