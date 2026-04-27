import { Component } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import api from '../lib/api.js'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('BarberOS Error:', error, errorInfo)
    this.setState({ errorInfo })
    api.post('/error-logs', {
      level:    'error',
      type:     'js_error',
      message:  error.message || 'Unknown React render error',
      stack:    error.stack   || null,
      metadata: { componentStack: errorInfo.componentStack },
    }).catch(() => {})
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6">
          <div className="bg-[#1A1A1A] border border-red-500/20 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-red-950/50 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={28} className="text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-[#F5F5F0] mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
              Ada yang Tidak Beres
            </h2>
            <p className="text-sm text-red-300/80 mb-1 font-mono">
              {this.state.error?.message || 'Unknown error'}
            </p>
            <p className="text-xs text-[#6B7280] mb-6">
              Error ini telah dicatat. Coba muat ulang halaman atau kembali ke login.
            </p>
            {this.state.errorInfo && (
              <details className="text-left mb-4">
                <summary className="text-xs text-[#6B7280] cursor-pointer hover:text-[#F5F5F0] transition-colors">
                  Detail teknis
                </summary>
                <pre className="mt-2 text-xs text-red-300/60 bg-red-950/20 rounded-lg p-3 overflow-auto max-h-32 font-mono">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#C9A84C] text-[#0A0A0A] text-sm font-semibold hover:bg-[#E8C875] transition-colors"
              >
                <RefreshCw size={14} />
                Coba Lagi
              </button>
              <button
                onClick={() => { window.location.href = '/' }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#2A2A2A] text-[#F5F5F0] text-sm hover:border-[#C9A84C]/40 transition-colors"
              >
                <Home size={14} />
                Kembali ke Login
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
