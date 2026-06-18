# KIO Capacity Analysis

KIO Capacity Analysis is an Odoo 17 module for monitoring ISP capacity usage and upstream capacity purchases. It provides a kanban-style capacity overview, upstream purchase tracking, capacity item configuration, and an OWL client action dashboard that groups upstream purchases by provider.

## Module Information

| Item | Value |
| --- | --- |
| Technical name | `kio_capacity_analysis` |
| Odoo version | 17.0 |
| Category | Operations |
| Version | 17.0.1.0.0 |
| Dependencies | `base`, `web`, `mail` |

## Main Features

### Capacity Overview Dashboard

The main dashboard is available from **Capacity Analysis > Dashboard**. It is backed by the `kio.capacity.dashboard` model and displays live capacity metrics:

- Total Upstream Capacity
- Total Downstream Capacity
- Free Capacity
- Bandwidth Capacity
- MAC Capacity
- Upgrade Capacity
- Downgrade Capacity

The **Total Upstream Capacity** card shows the dynamic `total_upstream_capacity` value. Clicking this card opens the OWL Provider Capacity Dashboard client action.

### Dynamic Upstream Capacity Calculation

`total_upstream_capacity` is computed from `kio.capacity.upstream.purchase.line` records.

- Sums `purchased_capacity`
- Includes only lines whose parent upstream purchase is active
- Uses non-stored computation for fresh dashboard values on read/refresh
- Reflects upstream purchase line changes after dashboard reload

### Upstream Purchase Management

The module adds the `kio.capacity.upstream.purchase` model for recording purchased upstream capacity by provider.

Key fields:

- `reference`: sequence-generated purchase reference
- `provider_id`: upstream provider
- `responsible_user_id`: responsible user
- `purchase_date`: purchase date
- `active`: archive status
- `line_ids`: purchased capacity item lines
- `purchased_capacity`: computed total Mbps from lines
- `price`: computed total price from lines

Each purchase line uses `kio.capacity.upstream.purchase.line` and stores:

- Capacity item
- Purchased capacity in Mbps
- Unit price
- Computed total price

### Provider Capacity Dashboard

The OWL client action dashboard is registered with:

```xml
<record id="action_kio_capacity_client_dashboard" model="ir.actions.client">
    <field name="name">Provider Capacity Dashboard</field>
    <field name="tag">kio_capacity_analysis.capacity_dashboard</field>
</record>
```

The dashboard component:

- Uses Odoo 17 OWL conventions
- Fetches `kio.capacity.upstream.purchase` records with `orm.searchRead`
- Includes active and inactive records with `active_test: false`
- Groups records by `provider_id` in JavaScript
- Shows total active capacity, total spend, and total providers
- Renders one card per provider
- Displays provider capacity, total price, and active count versus total count
- Opens filtered upstream purchase tree/form views from each provider card

### Capacity Items

Capacity item configuration is available under **Capacity Analysis > Configuration > Capacity Items**.

The `kio.capacity.item` model is used to classify upstream purchase line capacity entries.

### Sequence

Upstream purchase references use the `kio.capacity.upstream.purchase` sequence.

Current format:

```text
UPC/%(year)s/00001
```

Example:

```text
UPC/2026/00001
```

## Navigation

| Menu | Purpose |
| --- | --- |
| Capacity Analysis > Dashboard | Main capacity overview dashboard |
| Total Upstream Capacity card | Opens the OWL Provider Capacity Dashboard |
| Capacity Analysis > Configuration > Capacity Items | Manage capacity item records |

The upstream purchase action is also defined with kanban, tree, and form views. The kanban view groups records by `provider_id`.

## Technical Components

### Python Models

| Model | Purpose |
| --- | --- |
| `kio.capacity.dashboard` | Main computed capacity dashboard |
| `kio.capacity.dashboard.customer` | Customer capacity detail records |
| `kio.capacity.dashboard.customer.line` | Customer offer capacity detail lines |
| `kio.capacity.upstream.purchase` | Upstream provider purchase header |
| `kio.capacity.upstream.purchase.line` | Upstream purchase capacity lines |
| `kio.capacity.item` | Capacity item configuration |

### Views and Actions

| File | Contents |
| --- | --- |
| `views/views.xml` | Main capacity dashboard kanban, dashboard action, root menu |
| `views/upstream_purchase_views.xml` | Upstream purchase views, capacity item views, upstream purchase action |
| `views/capacity_dashboard_views.xml` | OWL client action for Provider Capacity Dashboard |

### Web Assets

| File | Purpose |
| --- | --- |
| `static/src/js/capacity_dashboard.js` | OWL component and action registry entry |
| `static/src/xml/capacity_dashboard.xml` | OWL dashboard template |
| `static/src/scss/capacity_dashboard.scss` | Dashboard styling |

### Data and Security

| File | Purpose |
| --- | --- |
| `data/capacity_dashboard_data.xml` | Initial dashboard record |
| `data/upstream_purchase_sequence.xml` | Upstream purchase sequence |
| `security/ir.model.access.csv` | Access rules for dashboard, purchase, line, and item models |

## Installation

1. Copy the module to an Odoo 17 addons path.
2. Update the Odoo app list.
3. Install **KIO Capacity Analysis**.
4. Open **Capacity Analysis > Dashboard**.

## Upgrade Notes

After changing assets or XML files, upgrade the module and refresh Odoo backend assets.

For sequence prefix changes, note that `data/upstream_purchase_sequence.xml` uses `noupdate="1"`. Existing databases may not receive sequence updates automatically during module upgrade. Update the sequence manually from Odoo technical settings if needed.

## Access Rights

Base internal users can read the dashboard and manage upstream purchase, upstream purchase line, capacity item, and customer capacity records according to `security/ir.model.access.csv`.

## License

LGPL-3
