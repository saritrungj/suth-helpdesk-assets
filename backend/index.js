const express = require('express')
const cors = require('cors')
require('dotenv').config()

// Import routes
const masterDataRoutes = require('./routes/master-data')
const devicesRoutes = require('./routes/devices')
const contractsRoutes = require('./routes/contracts')
const printTransactionsRoutes = require('./routes/print-transactions')
const dashboardRoutes = require('./routes/dashboard')

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: 'Hospital IT Asset Management API 🚀',
    version: '1.0.0',
    endpoints: {
      devices: '/api/devices',
      contracts: '/api/contracts',
      print_transactions: '/api/print-transactions',
      dashboard: '/api/dashboard',
      master_data: {
        brands: '/api/brands',
        buildings: '/api/buildings',
        floors: '/api/floors',
        divisions: '/api/divisions',
        departments: '/api/departments',
        fiscal_years: '/api/fiscal-years'
      }
    }
  })
})

// API Routes
app.use('/api', masterDataRoutes)
app.use('/api/devices', devicesRoutes)
app.use('/api/contracts', contractsRoutes)
app.use('/api/print-transactions', printTransactionsRoutes)
app.use('/api/dashboard', dashboardRoutes)

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.url} not found` })
})

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`)
})