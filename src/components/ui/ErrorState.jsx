import { Component } from 'react';
import PropTypes from 'prop-types';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from './Button';

/**
 * Errors state what happened and how to fix it. They do not apologise and
 * they are never vague.
 */
export function ErrorState({ error, onRetry }) {
  const message =
    error?.message || 'Something went wrong while loading this view.';
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="rounded-full border border-rose/25 bg-rose/10 p-3">
        <AlertTriangle className="h-5 w-5 text-rose" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-sm font-semibold">This didn&apos;t load</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );
}

ErrorState.propTypes = {
  error: PropTypes.shape({ message: PropTypes.string }),
  onRetry: PropTypes.func,
};

/** Stops one broken screen from taking down the whole console. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Replace with your error tracker (Sentry etc.) in production.
    console.error('Unhandled UI error', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorState
          error={this.state.error}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

ErrorBoundary.propTypes = { children: PropTypes.node };
