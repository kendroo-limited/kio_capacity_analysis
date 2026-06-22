from odoo import api, models, fields


class ProductTemplate(models.Model):
    _inherit = "product.template"

    is_upstream_service = fields.Boolean(
        string="Upstream Service",
        default=False,
        help="Check this if this capacity item belongs to Upstream Service"
    )