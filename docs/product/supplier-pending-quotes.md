# Supplier-pending quote materials

An estimator can prepare an internal quote before the supply house confirms a
part or price. After selecting Materials as the line type, search Inventory in
one field. Results are bounded server searches over the existing material catalog;
choose with a pointer or Down/Up and Enter. Escape dismisses the results. Selecting
an item reads its company weighted-average stock cost when available.

Use **Use unlisted material** when the catalog item is not known yet. Enter the
working description and quantity, leave unknown cost/selling price blank, retain
**Supplier pricing pending**, and enter a pending supplier note of at least ten
characters. A listed material can also have pending pricing. Calculate and save
the draft normally. This is a quote working line, not a newly created Inventory
catalog record. No stock, job, PO, invoice or supplier order is created.

Blank monetary inputs remain null and display as **Pending**, never as $0.00.
Zero remains a deliberately entered numeric value, subject to ordinary zero-cost
and no-charge review. Known line amounts are available separately as explicitly
partial subtotals. If selling is known but cost is not, selling/tax totals remain
available, while cost, profit, margin and markup stay unknown. The quote catalog
continues to label the quote supplier-pending even when selling totals are known.

To finish, select the actual native Inventory item, review its cost (or provide the
normal reviewed override), fill in the selling rate, and clear pending pricing.
Recalculate and save a new revision. Historical pending revisions keep their
original null values, notes and material links; they do not inherit completed rates.
An unlisted line must acquire a native material UUID before becoming complete.
Material catalog administration stays in Inventory; this workflow does not create
another catalog or silently create a placeholder material at zero cost.

Incomplete pricing is a server-enforced gate. It cannot be waived by an admin
pricing approval, permissive margin policy, or acknowledgment of flags. Customer
HTML/document projection and template publishing reject an incomplete selected
revision. The workbench disables these actions and shows the pending reason.
Pricing completion is not quote offering, customer acceptance, job conversion or
procurement; those milestones remain open.
