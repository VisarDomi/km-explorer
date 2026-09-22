import Foundation

struct ViewPosition: Codable, Sendable {
    let path: String
    let y: Double
    static func route(_ path: String) -> String? {
        guard let url = URLComponents(string: path), url.scheme == nil, url.host == nil,
              url.fragment == nil, path.count < 2048 else { return nil }
        let route = url.percentEncodedPath
        if route == "/" { return "library:" + path }
        if route == "/favs" || route == "/favs/" { return nil }
        if route.range(of: "^/page/[0-9]+/?$", options: .regularExpression) != nil {
            let number = route.split(separator: "/").last.flatMap { Int($0) }
            return number.map { $0 >= 2 } == true ? "library:" + path : nil
        }
        if route.range(of: "^/actor/[^/]+/?$", options: .regularExpression) != nil { return "library:" + path }
        if route.range(of: "^/[^/]+/?$", options: .regularExpression) != nil { return "video:" + path }
        return nil
    }
    func validate() throws {
        guard Self.route(path) != nil, y.isFinite, (0...1_000_000_000).contains(y) else { throw ReaderError.invalidRequest }
    }
}
struct ViewState: Codable, Sendable {
    var lastPath = "/"
    var libraryPath = "/"
    var positions: [String: ViewPosition] = [:]
}
enum ReaderError: LocalizedError {
    case invalidRequest
    var errorDescription: String? { "Invalid Ytb request" }
}

// Only idempotent public reads use this recovery policy. Cancellation terminates
// connectivity waits and backoff immediately; permanent HTTP failures are returned.
private struct RetryableResponse: Error { let after: Double? }
func retryableResponse(_ response: URLResponse) throws {
    guard let http = response as? HTTPURLResponse,
          [408, 429, 500, 502, 503, 504].contains(http.statusCode) else { return }
    let header = http.value(forHTTPHeaderField: "Retry-After")
    var after = header.flatMap(Double.init)
    if after == nil, let header {
        let format = DateFormatter(); format.locale = Locale(identifier: "en_US_POSIX")
        format.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        after = format.date(from: header)?.timeIntervalSinceNow
    }
    throw RetryableResponse(after: after.flatMap { $0.isFinite ? max(0, $0) : nil })
}
func recoverNetworkRead<T>(enabled: Bool = true, isolation: isolated (any Actor)? = #isolation, _ operation: () async throws -> T) async throws -> T {
    var delay = 1.0
    while true {
        try Task.checkCancellation()
        do { return try await operation() }
        catch {
            try Task.checkCancellation()
            let network = error as? URLError
            let transient = network.map { [.notConnectedToInternet, .networkConnectionLost, .timedOut,
                .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed].contains($0.code) } ?? false
            let response = error as? RetryableResponse
            guard enabled && (transient || response != nil) else { throw error }
            let seconds = max(delay, response?.after ?? 0)
            try await Task.sleep(for: .seconds(seconds))
            delay = min(delay * 2, 30)
        }
    }
}
