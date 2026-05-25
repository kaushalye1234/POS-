const DEFAULT_BUSINESS_TIME_ZONE = 'Asia/Colombo';

function getFormatterParts(formatter, date = new Date()) {
    const parts = formatter.formatToParts(date);
    const values = {};

    for (const part of parts) {
        if (part.type !== 'literal') {
            values[part.type] = part.value;
        }
    }

    return values;
}

function createBusinessDateFormatter(timeZone = DEFAULT_BUSINESS_TIME_ZONE) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function createBusinessTimeFormatter(timeZone = DEFAULT_BUSINESS_TIME_ZONE) {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function formatBusinessDate(date = new Date(), timeZone = DEFAULT_BUSINESS_TIME_ZONE) {
    const parts = getFormatterParts(createBusinessDateFormatter(timeZone), date);
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatBusinessTime(date = new Date(), timeZone = DEFAULT_BUSINESS_TIME_ZONE) {
    const parts = getFormatterParts(createBusinessTimeFormatter(timeZone), date);
    return `${parts.hour}:${parts.minute}:${parts.second}`;
}

function getBusinessTimestampParts(date = new Date(), timeZone = DEFAULT_BUSINESS_TIME_ZONE) {
    return {
        saleDate: formatBusinessDate(date, timeZone),
        saleTime: formatBusinessTime(date, timeZone)
    };
}

module.exports = {
    DEFAULT_BUSINESS_TIME_ZONE,
    formatBusinessDate,
    formatBusinessTime,
    getBusinessTimestampParts
};
