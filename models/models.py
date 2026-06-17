# -*- coding: utf-8 -*-

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class KioCapacityDashboard(models.Model):
    _name = "kio.capacity.dashboard"
    _description = "KIO Capacity Dashboard"

    name = fields.Char(default="Capacity Overview", required=True)

    total_capacity = fields.Float(
        string="Total Capacity",
        compute="_compute_realtime_capacity",
        store=False,
    )

    bandwidth_capacity = fields.Float(
        string="Bandwidth Capacity",
        compute="_compute_realtime_capacity",
        store=False,
    )

    mac_capacity = fields.Float(
        string="MAC Capacity",
        compute="_compute_realtime_capacity",
        store=False,
    )

    free_capacity = fields.Float(
        string="Free Capacity",
        compute="_compute_realtime_capacity",
        store=False,
    )

    upgrade_capacity = fields.Float(
        string="Upgrade Capacity",
        compute="_compute_realtime_capacity",
        store=False,
    )

    downgrade_capacity = fields.Float(
        string="Downgrade Capacity",
        compute="_compute_realtime_capacity",
        store=False,
    )

    customer_line_ids = fields.One2many(
        "kio.capacity.dashboard.customer",
        "dashboard_id",
        string="Customer Capacity Details",
    )

    def _get_capacity_in_mbps_from_offer_line(self, line):
        capacity = line.capacity or 0.0
        if not capacity:
            return 0.0

        parameter = line.parameter if "parameter" in line._fields else "mb"

        if parameter == "gb":
            mb_value = self.env["ir.config_parameter"].sudo().get_param(
                "isp.mb_value",
                default="0",
            )
            try:
                mb_factor = float(mb_value)
            except (TypeError, ValueError):
                mb_factor = 0.0

            if mb_factor <= 0.0:
                raise ValidationError(
                    _("Please configure a positive 'MB Value' in Settings > ISP Configuration to convert GB capacities.")
                )

            return capacity * mb_factor

        return capacity


    def _get_change_request_capacity_totals(self):
        ChangeRequest = self.env["isp.portal.change.request"].sudo()
        requests = ChangeRequest.search([
            ("request_type", "in", ["upgrade", "downgrade"]),
            ("client_id.active", "=", True),
            ("client_id.client_type", "=", "bandwith"),
        ])

        upgrade_capacity = 0.0
        downgrade_capacity = 0.0
        for request in requests:
            current_capacity = request.current_capacity_total or request.current_capacity or 0.0
            requested_capacity = request.requested_capacity_total or request.requested_capacity or 0.0

            if request.request_type == "upgrade":
                upgrade_capacity += max(requested_capacity - current_capacity, 0.0)
            elif request.request_type == "downgrade":
                downgrade_capacity += max(current_capacity - requested_capacity, 0.0)

        return upgrade_capacity, downgrade_capacity

    @api.depends_context("uid")
    def _compute_realtime_capacity(self):
        Client = self.env["isp.client"].sudo()

        active_bandwidth_clients = Client.search([
            ("active", "=", True),
            ("client_type", "=", "bandwith"),
            ("pipeline_state", "=", "noc_confirm"),
        ])

        bandwidth_capacity = 0.0

        for client in active_bandwidth_clients:
            for line in client.offer_capacity_type_ids:
                bandwidth_capacity += self._get_capacity_in_mbps_from_offer_line(line)

        upgrade_capacity, downgrade_capacity = self._get_change_request_capacity_totals()

        mac_capacity = 0.0
        free_capacity = 0.0

        for dashboard in self:
            dashboard.bandwidth_capacity = bandwidth_capacity
            dashboard.mac_capacity = mac_capacity
            dashboard.upgrade_capacity = upgrade_capacity
            dashboard.downgrade_capacity = downgrade_capacity
            dashboard.total_capacity = bandwidth_capacity + mac_capacity
            dashboard.free_capacity = free_capacity


    def action_open_upgrade_requests(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": "Upgrade Capacity Requests",
            "res_model": "isp.portal.change.request",
            "view_mode": "tree,form",
            "domain": [
                ("request_type", "=", "upgrade"),
                ("client_id.active", "=", True),
                ("client_id.client_type", "=", "bandwith"),
            ],
            "context": {
                "create": False,
                "edit": False,
            },
            "target": "current",
        }


    def action_open_downgrade_requests(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": "Downgrade Capacity Requests",
            "res_model": "isp.portal.change.request",
            "view_mode": "tree,form",
            "domain": [
                ("request_type", "=", "downgrade"),
                ("client_id.active", "=", True),
                ("client_id.client_type", "=", "bandwith"),
            ],
            "context": {
                "create": False,
                "edit": False,
            },
            "target": "current",
        }

    def action_open_bandwidth_customers(self):
        self.ensure_one()

        return {
            "type": "ir.actions.act_window",
            "name": "Active Bandwidth Customers",
            "res_model": "isp.client",
            "view_mode": "tree,form",
            "domain": [
                ("active", "=", True),
                ("client_type", "=", "bandwith"),
                ("pipeline_state", "=", "noc_confirm"),
            ],
            "context": {
                "default_client_type": "bandwith",
                "create" : False,
                "edit" : False,
            },
            "target": "current",
        }