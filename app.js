
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect('mongodb+srv://NRSRaju:Raju9398@cluster0.0n9qgog.mongodb.net/gst-management?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Successfully connected to MongoDB'))
.catch((error) => console.error('Error connecting to MongoDB:', error));

// Models
const InvoiceSchema = new mongoose.Schema({
  recruiterID: { type: String, required: true },
  amount: { type: Number, required: true },
  gstAmount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
});

const Invoice = mongoose.model('Invoice', InvoiceSchema);

const PaymentSchema = new mongoose.Schema({
  invoiceID: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['success', 'failed'], required: true },
  transactionDate: { type: Date, default: Date.now },
});

const Payment = mongoose.model('Payment', PaymentSchema);

// Services
const GST_RATE = 0.18; // 18% GST
const gstCalculator = {
  calculateGST: (amount) => amount * GST_RATE,
};

const reportGenerator = {
  generateReport: (invoices) => {
    const totalGSTCollected = invoices.reduce((sum, invoice) => sum + invoice.gstAmount, 0);
    const pendingInvoices = invoices.filter(invoice => invoice.status === 'pending').length;
    const paidInvoices = invoices.filter(invoice => invoice.status === 'paid').length;

    return {
      totalGSTCollected,
      totalInvoices: invoices.length,
      pendingInvoices,
      paidInvoices,
    };
  },
};

// Utility functions to fetch data from database
const fetchDataFromDatabase = async () => {
  const totalGSTCollected = await Invoice.aggregate([
    { $group: { _id: null, total: { $sum: "$gstAmount" } } }
  ]);
  const pendingPayments = await Invoice.countDocuments({ status: 'pending' });
  const totalInvoices = await Invoice.countDocuments();
  const monthlyGSTAverage = await Invoice.aggregate([
    {
      $group: {
        _id: { $month: "$createdAt" },
        average: { $avg: "$gstAmount" }
      }
    },
    { $group: { _id: null, average: { $avg: "$average" } } }
  ]);

  return {
    totalGSTCollected: totalGSTCollected[0]?.total || 0,
    pendingPayments,
    totalInvoices,
    monthlyGSTAverage: monthlyGSTAverage[0]?.average || 0
  };
};

const fetchPaymentsFromDatabase = async (filter) => {
  const query = filter !== 'all' ? { status: filter } : {};
  const payments = await Payment.find(query).populate('invoiceID');
  return payments;
};

// Routes
app.post('/api/invoices', async (req, res) => {
  try {
    const { recruiterID, amount } = req.body;
    const gstAmount = gstCalculator.calculateGST(amount);
    const newInvoice = new Invoice({ recruiterID, amount, gstAmount });
    await newInvoice.save();
    res.status(201).json(newInvoice);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get('/api/invoices', async (req, res) => {
  try {
    const invoices = await Invoice.find();
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/payments', async (req, res) => {
  try {
    const { invoiceID, amount } = req.body;
    const invoice = await Invoice.findById(invoiceID);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const payment = new Payment({ invoiceID, amount, status: 'success' });
    await payment.save();

    invoice.status = 'paid';
    await invoice.save();

    res.status(201).json(payment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get('/api/reports', async (req, res) => {
  try {
    const { start, end } = req.query;
    const query = {};
    if (start && end) {
      query.createdAt = { $gte: new Date(start), $lte: new Date(end) };
    }
    const invoices = await Invoice.find(query);
    const report = reportGenerator.generateReport(invoices);
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const data = await fetchDataFromDatabase();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/api/payments', async (req, res) => {
  try {
    const filter = req.query.filter;
    const payments = await fetchPaymentsFromDatabase(filter);
    res.status(200).json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
