import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Component, ErrorInfo, ReactNode } from 'react'
import terminal from 'virtual:terminal'

interface Props {
  children?: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // --- 性能调查：将手机端崩溃信息实时发送到 PowerShell ---
    terminal.log(`
[FATAL ERROR] 应用程序崩溃:
- Error: ${error.toString()}
- Stack: ${errorInfo.componentStack}
- UserAgent: ${navigator.userAgent}
    `);
    console.error('Uncaught error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  private handleReload = () => {
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-gray-100 p-6">
          <div className="bg-gray-800 border border-red-800/50 rounded-xl p-8 max-w-lg w-full shadow-2xl">
            <div className="flex items-center gap-3 text-red-500 mb-4">
              <AlertTriangle className="w-8 h-8" />
              <h2 className="text-xl font-bold">出错了</h2>
            </div>
            
            <p className="text-gray-300 mb-6 leading-relaxed">
              应用程序遇到意外错误，无法继续渲染。请尝试刷新页面。
            </p>

            {this.state.error && (
              <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-auto max-h-48 border border-gray-700">
                <p className="text-red-400 font-mono text-sm break-words whitespace-pre-wrap">
                  {this.state.error.toString()}
                </p>
                {this.state.errorInfo && (
                  <pre className="text-gray-500 text-xs mt-2 overflow-x-auto">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            <button
              onClick={this.handleReload}
              className="flex items-center justify-center gap-2 w-full py-3 bg-[var(--theme-color)] hover:bg-[var(--theme-color-hover)] text-white rounded-lg font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              刷新页面
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
