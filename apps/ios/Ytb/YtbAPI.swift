import Foundation
import Security

// Only this LAN host may use the bundled PUBLIC local CA. TLS hostname and
// certificate validity are still evaluated; no accept-all certificate handler.
final class LocalTrust: NSObject, URLSessionDelegate, @unchecked Sendable {
    let host: String
    let certificateURL: URL?
    init(host: String, certificateURL: URL?) {
        self.host = host
        self.certificateURL = certificateURL
    }

    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              challenge.protectionSpace.host == host,
              let trust = challenge.protectionSpace.serverTrust,
              let certificateURL, let data = try? Data(contentsOf: certificateURL),
              let certificate = SecCertificateCreateWithData(nil, data as CFData)
        else { completionHandler(.performDefaultHandling, nil); return }
        SecTrustSetPolicies(trust, SecPolicyCreateSSL(true, host as CFString))
        SecTrustSetAnchorCertificates(trust, [certificate] as CFArray)
        SecTrustSetAnchorCertificatesOnly(trust, true)
        if SecTrustEvaluateWithError(trust, nil) {
            completionHandler(.useCredential, URLCredential(trust: trust))
        } else {
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }
}

struct HTTPResult: Codable, Sendable {
    let status: Int
    let headers: [String: String]
    let body: String
}

actor YtbAPI {
    private let session: URLSession
    private let origin: String
    init(origin: String, pc: URL, certificateURL: URL?) {
        self.origin = origin
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 25
        config.timeoutIntervalForResource = 90
        config.httpMaximumConnectionsPerHost = 12
        config.urlCache = URLCache(memoryCapacity: 8 * 1024 * 1024, diskCapacity: 64 * 1024 * 1024)
        let queue = OperationQueue(); queue.name = "Ytb.Network"; queue.maxConcurrentOperationCount = 1
        session = URLSession(configuration: config, delegate: LocalTrust(host: pc.host ?? "", certificateURL: certificateURL), delegateQueue: queue)
    }
    func request(_ input: Data) async throws -> (Data, HTTPURLResponse) {
        let args = try JSONSerialization.jsonObject(with: input) as? [String: Any] ?? [:]
        guard let raw = args["url"] as? String, let url = URL(string: raw), url.scheme == "https", url.host != nil else { throw ReaderError.invalidRequest }
        var request = URLRequest(url: url)
        request.httpMethod = args["method"] as? String ?? "GET"
        for (key,value) in args["headers"] as? [String:String] ?? [:] { request.setValue(value, forHTTPHeaderField: key) }
        let referrer = args["referrer"] as? String ?? origin + "/"
        request.setValue(referrer.hasPrefix("https://") ? referrer : origin + "/", forHTTPHeaderField: "Referer")
        if let body = args["body"] as? String { request.httpBody = Data(body.utf8) }
        let (data,response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ReaderError.invalidRequest }
        return (data,http)
    }
}
