import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center p-8">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
            <AlertTriangle size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-off-white mb-2">Terjadi Kesalahan</h2>
          <p className="text-muted text-sm mb-6 max-w-sm">
            {this.state.error?.message || 'Komponen ini mengalami error yang tidak terduga.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 px-4 py-2 bg-gold/10 border border-gold/30 text-gold rounded-xl text-sm font-medium hover:bg-gold/20 transition-colors"
          >
            <RefreshCw size={14} />
            Coba Lagi
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
