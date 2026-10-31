---
title: SOAP
question: A partner sent me a WSDL and one URL. What am I actually meant to put on the wire?
order: 7
practise:
  - http-fetch-not-ok
  - http-content-type-charset
  - http-retry-safe-methods
sources:
  - author: W3C
    title: 'Simple Object Access Protocol (SOAP) 1.1'
    url: https://www.w3.org/TR/2000/NOTE-SOAP-20000508/
  - author: W3C
    title: 'SOAP Version 1.2 Part 1: Messaging Framework'
    url: https://www.w3.org/TR/soap12-part1/
  - author: W3C
    title: 'Web Services Description Language (WSDL) 1.1'
    url: https://www.w3.org/TR/2001/NOTE-wsdl-20010315
verified: 2026-08-02
---

SOAP is a way for systems to call each other in which every call is an XML document posted to one
address. You will usually meet it as an integration somebody else built, at a bank, a carrier, a
government service or an ERP, and the job is getting a client to talk to it rather than building
one. Little of what you know from REST carries over: which operation you called is inside the
document, and an ordinary refusal comes back as a server error.

## The model

A SOAP message is an XML document, and the document is the protocol. HTTP only carries it. W3C's
SOAP 1.1 note: "A SOAP message is an XML document that consists of a mandatory SOAP envelope, an
optional SOAP header, and a mandatory SOAP body." The `Envelope` is "the top element of the XML
document representing the message", the `Header`, if present, "MUST be the first immediate child
element of a SOAP Envelope element", and the `Body` "MUST be present" and "MUST directly follow the
SOAP Header element if present".

That two-part split is the design. The Body carries the call. The Header carries everything wrapped
around the call: credentials, a transaction id, routing, signatures. A header can also be declared
non-negotiable. The `mustUnderstand` attribute "can be used to indicate whether a header entry is
mandatory or optional for the recipient to process", and when it is set the recipient "either MUST
obey the semantics ... or MUST fail processing the message". This is where the WS-\* extensions live,
which is why WS-Security is a header block rather than a separate protocol.

Over HTTP, everything is one POST to one URL. SOAP 1.1's binding "only defines SOAP within HTTP POST
requests", the media type is `text/xml`, and a client "MUST use" a `SOAPAction` header field. Three
consequences follow, and they are the ones that catch people arriving from REST:

- The URL identifies a service, not a resource. Which operation you called is inside the XML, and
  echoed in `SOAPAction`.
- The method carries no meaning, so nothing HTTP knows about safety, caching or retries applies. A
  read and a payment are both POSTs to the same address.
- The transport is swappable. SOAP 1.1 says it "can potentially be used in combination with a
  variety of other protocols", and plenty of real deployments run it over a message queue.

SOAP 1.2 moved three things worth checking before you debug anything else: the envelope namespace is
`http://www.w3.org/2003/05/soap-envelope` rather than `http://schemas.xmlsoap.org/soap/envelope/`,
the media type is `application/soap+xml`, and `mustUnderstand` is an `xs:boolean` rather than the
literal `1` or `0`. Nothing in a URL tells you which version an endpoint speaks.

**A WSDL is the contract, and it exists to be fed to a code generator.** WSDL 1.1 is "an XML format
for describing network services as a set of endpoints operating on messages", and it has an abstract
half and a concrete half. Abstract: `types` is "a container for data type definitions", `message` is
"an abstract, typed definition of the data being communicated", `operation` is "an abstract
description of an action supported by the service", and `portType` is "an abstract set of operations
supported by one or more endpoints". Concrete: `binding` is "a concrete protocol and data format
specification for a particular port type", `port` is "a single endpoint defined as a combination of a
binding and a network address", and `service` is "a collection of related endpoints".

Read it to find the endpoint and the operation names, then generate the client. Hand-rolling the
envelope is possible and is a bad trade: the namespaces, the element ordering and the XSD types in
`types` are all load-bearing, and a generator gets them right for free.

## Worked example

The smallest complete exchange, from the SOAP 1.1 note. The request:

```http
POST /StockQuote HTTP/1.1
Host: www.stockquoteserver.com
Content-Type: text/xml; charset="utf-8"
Content-Length: nnnn
SOAPAction: "Some-URI"

<SOAP-ENV:Envelope
  xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
  SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
   <SOAP-ENV:Body>
       <m:GetLastTradePrice xmlns:m="Some-URI">
           <symbol>DIS</symbol>
       </m:GetLastTradePrice>
   </SOAP-ENV:Body>
</SOAP-ENV:Envelope>
```

The same call going wrong:

```http
HTTP/1.1 500 Internal Server Error
Content-Type: text/xml; charset="utf-8"

<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
   <SOAP-ENV:Body>
       <SOAP-ENV:Fault>
           <faultcode>SOAP-ENV:Server</faultcode>
           <faultstring>Server Error</faultstring>
           <detail>
               <e:myfaultdetails xmlns:e="Some-URI">
                 <message>My application didn't work</message>
                 <errorcode>1001</errorcode>
               </e:myfaultdetails>
           </detail>
       </SOAP-ENV:Fault>
   </SOAP-ENV:Body>
</SOAP-ENV:Envelope>
```

The status is not a suggestion. SOAP 1.1: "In case of a SOAP error while processing the request, the
SOAP HTTP server MUST issue an HTTP 500 'Internal Server Error' response and include a SOAP message
in the response containing a SOAP Fault element." A 500 is the normal way this protocol says no.

Both values in those HTTP headers came out of the WSDL, from the concrete half:

```xml
<binding name="StockQuoteSoapBinding" type="tns:StockQuotePortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="GetLastTradePrice">
       <soap:operation soapAction="http://example.com/GetLastTradePrice"/>
       <input><soap:body use="literal"/></input>
       <output><soap:body use="literal"/></output>
    </operation>
</binding>

<service name="StockQuoteService">
    <port name="StockQuotePort" binding="tns:StockQuoteSoapBinding">
       <soap:address location="http://example.com/stockquote"/>
    </port>
</service>
```

`soap:address` is the URL you POST to. `soapAction` is the header value, copied without
interpretation: WSDL says "this URI value should be used directly as the value for the SOAPAction
header; no attempt should be made to make a relative URI value absolute when making the request."

One habit pays for itself on day one. Capture a real request and response off the wire, whole, and
keep them as fixtures. Every later argument about whose end is broken is settled by comparing bytes
against a message the service already accepted.

## Traps

**Every call comes back 500 and the client library throws before you see anything useful.** That is
what a fault looks like from the outside, and the diagnosis is in the body you discarded. Read it:
`faultcode` is a qualified name naming the class of failure, `faultstring` "should provide at least
some information explaining the nature of the fault", and `detail` "MUST be present if the contents
of the Body element could not be successfully processed". Log the body on a 500 before anything else.

**A `VersionMismatch` fault, or a flat rejection with no fault at all.** The envelope namespace is
wrong for the endpoint. `VersionMismatch` means exactly that: "the processing party found an invalid
namespace for the SOAP Envelope element." A generated client aimed at the wrong SOAP version gets
both the namespace and the media type wrong at once, `text/xml` against `application/soap+xml`, so
check the version pair before you go looking at the payload.

**A `MustUnderstand` fault after somebody trimmed the envelope.** A header entry marked
`mustUnderstand` was dropped, renamed, or stripped by a proxy, and the fault fires because that
attribute makes processing it compulsory rather than optional. There is no partial credit here: an
unhandled mandatory header fails the whole message, however good the Body is.

**The service says the operation does not exist, and the Body is plainly right.** `SOAPAction`
is missing, or holds a value that is not the one in the WSDL. SOAP 1.1 requires the client to send
the field, its value tells the server the intent of the message, and the spec is blunt about the
empty case: "no value means that there is no indication of the intent of the message". Middleboxes
read it too, since the note names firewalls filtering on it as a use, so the header can be rewritten
before the service ever sees it.

**A timeout, a retry, and the order booked twice.** Everything is a POST, so nothing in the path
knows whether repeating a call is safe, and none of HTTP's retry rules help you. SOAP has no
built-in answer either; the 1.1 note lists batching among the features deliberately left out of the
protocol. Deduplication is yours to carry, in a header the service has agreed to honour, or it does
not exist.
