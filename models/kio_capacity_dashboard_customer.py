# -*- coding: utf-8 -*-

from odoo import fields, models


class KioCapacityDashboardCustomer(models.Model):
    _name = "kio.capacity.dashboard.customer"
    _description = "KIO Capacity Dashboard Customer"
    _order = "id desc"

    dashboard_id = fields.Many2one(
        "kio.capacity.dashboard",
        string="Dashboard",
        required=True,
        ondelete="cascade",
    )

    name = fields.Char(string="Customer", required=True)

    partner_id = fields.Many2one(
        "res.partner",
        string="Partner",
    )

    survey_id = fields.Many2one(
        "isp.survey",
        string="Survey",
        readonly=True,
    )

    work_order_id = fields.Many2one(
        "isp.work.order",
        string="Work Order",
        readonly=True,
    )

    transmission_id = fields.Many2one(
        "isp.transmission.nttn",
        string="NTTN Transmission",
        readonly=True,
    )

    client_type = fields.Selection(
        [
            ("mac", "Mac"),
            ("bandwith", "Bandwidth"),
            ("corporate", "Corporate"),
        ],
        string="Client Type",
    )

    bandwidth_capacity = fields.Float(string="Bandwidth Capacity", default=0.0)
    mac_capacity = fields.Float(string="MAC Capacity", default=0.0)
    total_capacity = fields.Float(string="Total Capacity", default=0.0)

    offer_total_price = fields.Float(string="Total Offer Price", default=0.0)

    confirmed_date = fields.Datetime(
        string="NOC Confirmed Date",
        default=fields.Datetime.now,
    )

    offer_capacity_detail_ids = fields.One2many(
        "kio.capacity.dashboard.customer.line",
        "customer_dashboard_id",
        string="Offer Bandwidth Details",
    )