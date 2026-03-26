const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const protect = require('../middleware/auth');

// ── All contact routes require a valid JWT ────────────────────────────────────
router.use(protect);

// ── GET /api/contacts  —  list with search / filter / sort ────────────────────
router.get('/', async (req, res) => {
  try {
    const { search, category, favorite, sort = 'firstName' } = req.query;

    // Always scope to the logged-in user
    const query = { userId: req.user._id };

    // Search across name, email, phone, company
    if (search && search.trim()) {
      const re = { $regex: search.trim(), $options: 'i' };
      query.$or = [
        { firstName: re },
        { lastName:  re },
        { email:     re },
        { phone:     re },
        { company:   re },
      ];
    }

    if (category && category !== 'All') query.category = category;
    if (favorite === 'true') query.isFavorite = true;

    // Sort options
    const sortMap = {
      firstName: { firstName: 1, lastName: 1 },
      lastName:  { lastName: 1, firstName: 1 },
      createdAt: { createdAt: -1 },
    };
    const sortOptions = sortMap[sort] || sortMap.firstName;

    const contacts = await Contact.find(query).sort(sortOptions).lean();

    // Pagination
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 9));
    const totalContacts = await Contact.countDocuments(query);
    const totalPages    = Math.ceil(totalContacts / limit) || 1;
    const paginatedContacts = contacts.slice((page - 1) * limit, page * limit);

    // Stats scoped to this user only
    const [total, favorites, distinctCategories] = await Promise.all([
      Contact.countDocuments({ userId: req.user._id }),
      Contact.countDocuments({ userId: req.user._id, isFavorite: true }),
      Contact.distinct('category', { userId: req.user._id }),
    ]);

    // Category counts for pills
    const categoryCounts = {};
    for (const cat of ['Work', 'Personal', 'Family', 'Friend', 'Other']) {
      categoryCounts[cat] = await Contact.countDocuments({ userId: req.user._id, category: cat });
    }

    res.json({
      contacts: paginatedContacts,
      pagination: { page, limit, totalContacts: totalContacts, totalPages },
      stats: {
        total,
        favorites,
        categoriesUsed: distinctCategories.length,
        categoryCounts,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── GET /api/contacts/export/csv  —  download all contacts as CSV ─────────────
router.get('/export/csv', async (req, res) => {
  try {
    const contacts = await Contact.find({ userId: req.user._id })
      .sort({ firstName: 1, lastName: 1 }).lean();

    const headers = ['First Name','Last Name','Email','Phone','Company','Address','Category','Favourite','Notes'];
    const escape = (val) => {
      if (!val) return '';
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const rows = contacts.map(c => [
      escape(c.firstName), escape(c.lastName), escape(c.email), escape(c.phone),
      escape(c.company), escape(c.address), escape(c.category),
      c.isFavorite ? 'Yes' : 'No', escape(c.notes),
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ message: 'Export failed', error: err.message });
  }
});

// ── POST /api/contacts/import/csv  —  bulk create from CSV text ───────────────
router.post('/import/csv', async (req, res) => {
  try {
    const { csvText } = req.body;
    if (!csvText || !csvText.trim()) return res.status(400).json({ message: 'No CSV data provided' });

    const lines = csvText.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return res.status(400).json({ message: 'CSV must have a header row and at least one data row' });

    // Parse simple CSV (handles quoted fields)
    const parseLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
        else { current += ch; }
      }
      result.push(current.trim());
      return result;
    };

    const header = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
    const toIdx = (names) => {
      for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; }
      return -1;
    };

    const iFirst = toIdx(['firstname', 'first']);
    const iLast  = toIdx(['lastname', 'last']);
    const iEmail = toIdx(['email', 'emailaddress']);
    const iPhone = toIdx(['phone', 'phonenumber', 'mobile']);
    const iComp  = toIdx(['company', 'organisation', 'organization']);
    const iAddr  = toIdx(['address', 'city', 'cityaddress']);
    const iCat   = toIdx(['category', 'type', 'group']);
    const iNotes = toIdx(['notes', 'note', 'additionalnotes']);
    const iFav   = toIdx(['favourite', 'favorite', 'starred']);

    if (iFirst < 0) return res.status(400).json({ message: 'CSV must have a "First Name" column' });

    const validCategories = ['Work','Personal','Family','Friend','Other'];
    const contacts = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseLine(lines[i]);
      const firstName = cols[iFirst] || '';
      if (!firstName.trim()) { errors.push(`Row ${i + 1}: missing first name, skipped`); continue; }

      const cat = iCat >= 0 ? cols[iCat] : '';
      const favVal = iFav >= 0 ? (cols[iFav] || '').toLowerCase() : '';

      contacts.push({
        firstName: firstName.trim(),
        lastName:  iLast >= 0 ? (cols[iLast] || '').trim() : '',
        email:     iEmail >= 0 ? (cols[iEmail] || '').trim() : '',
        phone:     iPhone >= 0 ? (cols[iPhone] || '').trim() : '',
        company:   iComp >= 0 ? (cols[iComp] || '').trim() : '',
        address:   iAddr >= 0 ? (cols[iAddr] || '').trim() : '',
        category:  validCategories.includes(cat) ? cat : 'Other',
        notes:     iNotes >= 0 ? (cols[iNotes] || '').trim() : '',
        isFavorite: ['yes','true','1'].includes(favVal),
        userId: req.user._id,
      });
    }

    if (contacts.length === 0) return res.status(400).json({ message: 'No valid contacts found in CSV' });

    const created = await Contact.insertMany(contacts);
    res.status(201).json({ message: `${created.length} contacts imported successfully`, count: created.length, errors });
  } catch (err) {
    res.status(500).json({ message: 'Import failed', error: err.message });
  }
});

// ── GET /api/contacts/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const contact = await Contact.findOne({ _id: req.params.id, userId: req.user._id });
    if (!contact) return res.status(404).json({ message: 'Contact not found' });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── POST /api/contacts ────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    // Strip any userId the client might send; always use authenticated user
    const { userId: _stripped, ...fields } = req.body;
    const contact = await Contact.create({ ...fields, userId: req.user._id });
    res.status(201).json(contact);
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join('. ') });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── PUT /api/contacts/:id ─────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    // Prevent client from hijacking ownership
    const { userId: _stripped, ...updateData } = req.body;
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: updateData },
      { new: true, runValidators: true }
    );
    if (!contact) return res.status(404).json({ message: 'Contact not found' });
    res.json(contact);
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join('. ') });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── DELETE /api/contacts/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const contact = await Contact.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!contact) return res.status(404).json({ message: 'Contact not found' });
    res.json({ message: 'Contact deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── PATCH /api/contacts/:id/favorite  —  toggle star ─────────────────────────
router.patch('/:id/favorite', async (req, res) => {
  try {
    const contact = await Contact.findOne({ _id: req.params.id, userId: req.user._id });
    if (!contact) return res.status(404).json({ message: 'Contact not found' });
    contact.isFavorite = !contact.isFavorite;
    await contact.save();
    res.json(contact);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
