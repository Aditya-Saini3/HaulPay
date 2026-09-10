-- Default expense categories, owned by nobody (owner_id null) so every account
-- sees them and no account can edit them. Users add their own alongside these
-- and the two behave identically everywhere in the app.
--
-- The fixed/variable split is what drives cost-per-mile: fixed costs are
-- amortized onto every month, variable costs land on the day they happened.

with parents as (
  insert into expense_categories (owner_id, parent_id, name, icon, color, is_fixed, sort_order)
  values
    -- Fixed / recurring
    (null, null, 'Truck payment',        'bus-outline',            '#4C8DFF', true,  10),
    (null, null, 'Trailer payment',      'cube-outline',           '#4C8DFF', true,  20),
    (null, null, 'Insurance',            'shield-checkmark-outline','#5D6BFF', true,  30),
    (null, null, 'Authority & compliance','document-text-outline',  '#8A6BFF', true,  40),
    (null, null, 'ELD subscription',     'hardware-chip-outline',  '#8A6BFF', true,  50),
    (null, null, 'Parking / yard rental','business-outline',       '#6E7DFF', true,  60),
    (null, null, 'Accounting & software','calculator-outline',     '#6E7DFF', true,  70),
    (null, null, 'Phone / internet',     'phone-portrait-outline', '#6E7DFF', true,  80),
    -- Variable
    (null, null, 'Fuel',                 'flame-outline',          '#FF8A3D', false, 110),
    (null, null, 'DEF',                  'water-outline',          '#3DC7FF', false, 120),
    (null, null, 'Maintenance & repairs','construct-outline',      '#FFB13D', false, 130),
    (null, null, 'Tolls',                'card-outline',           '#FF6B6B', false, 140),
    (null, null, 'Scales',               'speedometer-outline',    '#FF6B6B', false, 150),
    (null, null, 'Lumper fees',          'people-outline',         '#FF6B6B', false, 160),
    (null, null, 'Driver pay',           'person-outline',         '#48D597', false, 170),
    (null, null, 'Showers, meals, motels','restaurant-outline',    '#48D597', false, 180)
  on conflict do nothing
  returning id, name, color, is_fixed
)
insert into expense_categories (owner_id, parent_id, name, icon, color, is_fixed, sort_order)
select
  null,
  p.id,
  sub.name,
  sub.icon,
  -- Subtypes inherit the parent's colour so the donut chart reads as one group.
  p.color,
  p.is_fixed,
  sub.sort_order
from parents p
join (
  values
    -- Insurance subtypes. An owner-operator carries most of these separately
    -- and needs them apart to see where the money goes.
    ('Insurance', 'Liability',              'shield-outline',          10),
    ('Insurance', 'Cargo',                  'cube-outline',            20),
    ('Insurance', 'Physical damage',        'car-outline',             30),
    ('Insurance', 'Occupational accident',  'medkit-outline',          40),
    ('Insurance', 'Bobtail',                'bus-outline',             50),
    ('Insurance', 'Workers'' comp',         'bandage-outline',         60),
    -- Authority & compliance. These are the annual bills that must be
    -- amortized rather than dumped into the month they were paid.
    ('Authority & compliance', 'MC/DOT fees',      'ribbon-outline',   10),
    ('Authority & compliance', 'UCR',              'receipt-outline',  20),
    ('Authority & compliance', 'IRP plates',       'pricetag-outline', 30),
    ('Authority & compliance', 'IFTA',             'map-outline',      40),
    ('Authority & compliance', 'Form 2290 HVUT',   'document-outline', 50),
    ('Authority & compliance', 'State permits',    'documents-outline',60),
    ('Authority & compliance', 'Drug consortium',  'flask-outline',    70),
    -- Maintenance subtypes.
    ('Maintenance & repairs', 'PM service',  'settings-outline',    10),
    ('Maintenance & repairs', 'Tires',       'ellipse-outline',     20),
    ('Maintenance & repairs', 'Brakes',      'disc-outline',        30),
    ('Maintenance & repairs', 'Engine',      'cog-outline',         40),
    ('Maintenance & repairs', 'APU',         'snow-outline',        50),
    ('Maintenance & repairs', 'Towing',      'trail-sign-outline',  60)
) as sub(parent_name, name, icon, sort_order)
  on sub.parent_name = p.name
on conflict do nothing;
