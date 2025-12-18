# backend/logging_config.py
"""
Structured logging configuration for Kuya Comps.
Provides JSON formatted logs for production and readable logs for development.
"""

import logging
import sys
import json
import os
from datetime import datetime
from typing import Any, Dict
from pythonjsonlogger import jsonlogger


class CustomJsonFormatter(jsonlogger.JsonFormatter):
    """
    Custom JSON formatter that adds standard fields to all log records.
    """
    
    def add_fields(self, log_record: Dict[str, Any], record: logging.LogRecord, message_dict: Dict[str, Any]) -> None:
        """Add custom fields to the log record."""
        super().add_fields(log_record, record, message_dict)
        
        # Add timestamp
        log_record['timestamp'] = datetime.utcnow().isoformat()
        
        # Add log level
        log_record['level'] = record.levelname
        
        # Add logger name
        log_record['logger'] = record.name
        
        # Add module and function info
        log_record['module'] = record.module
        log_record['function'] = record.funcName
        log_record['line'] = record.lineno
        
        # Add environment
        log_record['environment'] = os.getenv('ENVIRONMENT', 'development')


class ReadableFormatter(logging.Formatter):
    """
    Human-readable formatter for development.
    """
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record in a readable way."""
        # Color codes for different log levels
        colors = {
            'DEBUG': '\033[36m',      # Cyan
            'INFO': '\033[32m',       # Green
            'WARNING': '\033[33m',    # Yellow
            'ERROR': '\033[31m',      # Red
            'CRITICAL': '\033[35m',   # Magenta
        }
        reset = '\033[0m'
        
        # Add color to level name
        levelname = record.levelname
        if levelname in colors:
            colored_levelname = f"{colors[levelname]}{levelname}{reset}"
        else:
            colored_levelname = levelname
        
        # Format the message
        timestamp = datetime.fromtimestamp(record.created).strftime('%Y-%m-%d %H:%M:%S')
        base_msg = f"{timestamp} | {colored_levelname:20} | {record.name:20} | {record.getMessage()}"
        
        # Add extra fields if present
        if hasattr(record, 'extra_data'):
            extra_str = json.dumps(record.extra_data, indent=2)
            return f"{base_msg}\n{extra_str}"
        
        return base_msg


def setup_logging(
    log_level: str = None,
    use_json: bool = None
) -> logging.Logger:
    """
    Setup logging configuration for the application.
    
    Args:
        log_level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        use_json: Whether to use JSON formatting (default: True for production)
    
    Returns:
        Configured root logger
    """
    # Determine environment
    environment = os.getenv('ENVIRONMENT', 'development')
    is_production = environment == 'production'
    
    # Set defaults based on environment
    if log_level is None:
        log_level = 'INFO' if is_production else 'DEBUG'
    
    if use_json is None:
        use_json = is_production
    
    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper()))
    
    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Create console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, log_level.upper()))
    
    # Set formatter based on environment
    if use_json:
        # JSON formatter for production
        formatter = CustomJsonFormatter(
            '%(timestamp)s %(level)s %(logger)s %(module)s %(function)s %(message)s'
        )
    else:
        # Readable formatter for development
        formatter = ReadableFormatter()
    
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    # Configure third-party loggers to be less verbose
    logging.getLogger('uvicorn').setLevel(logging.WARNING)
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('slowapi').setLevel(logging.INFO)
    
    return root_logger


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance for a specific module.
    
    Args:
        name: Logger name (usually __name__)
    
    Returns:
        Logger instance
    """
    return logging.getLogger(name)


# Example usage function
def log_with_context(
    logger: logging.Logger,
    level: str,
    message: str,
    **extra_fields: Any
) -> None:
    """
    Log a message with additional context fields.
    
    Args:
        logger: Logger instance
        level: Log level (debug, info, warning, error, critical)
        message: Log message
        **extra_fields: Additional fields to include in the log
    
    Example:
        log_with_context(
            logger,
            'info',
            'Search started',
            query='baseball card',
            user_ip='192.168.1.1',
            correlation_id='abc-123'
        )
    """
    log_func = getattr(logger, level.lower())
    
    # Use 'extra' to pass additional fields to the logger
    log_func(message, extra={'extra_data': extra_fields})


# Initialize logging on module import
logger = setup_logging()
